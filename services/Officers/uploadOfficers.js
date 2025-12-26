// services/Officers/uploadOfficers.js
// Requires: npm install csv-parser validator
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const validator = require('validator');
const crypto = require('crypto'); // used to generate temporary officer passwords

const uploadOfficersService = (pool) => async (req, res) => {
	// Debug
	console.log('[uploadOfficers] headers:', {
		authorization: req.headers?.authorization,
		'content-type': req.headers?.['content-type'] || req.headers?.['Content-Type']
	});
	console.log('[uploadOfficers] req.file:', req.file, 'req.files:', req.files);

	// If multer used upload.any(), pick first file
	if (!req.file && Array.isArray(req.files) && req.files.length > 0) {
		req.file = req.files[0];
		console.log('[uploadOfficers] selected req.file from req.files:', req.file.fieldname, req.file.originalname);
	}

	// Fallback: accept CSV in body under file/csv/etc or raw text
	let createdTempFile = false;
	let tempFilePath = null;
	const bodyFileString = (typeof req.body === 'string' && req.body.length > 0)
		? req.body
		: (req.body && (req.body.file || req.body.csv || req.body.csvFile || req.body.data));

	if (!req.file && bodyFileString && typeof bodyFileString === 'string' && bodyFileString.length > 0) {
		try {
			const fileString = bodyFileString;
			let base64Data = fileString;
			const dataUrlMatch = fileString.match(/^data:(.+);base64,(.*)$/);
			let detectedMime = 'text/csv';
			if (dataUrlMatch) {
				detectedMime = dataUrlMatch[1] || 'text/csv';
				base64Data = dataUrlMatch[2];
			} else {
				const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(fileString.replace(/\r?\n/g,''));
				if (!looksLikeBase64) {
					base64Data = Buffer.from(fileString, 'utf8').toString('base64');
					detectedMime = 'text/csv';
				}
			}
			await fs.promises.mkdir(path.join(__dirname, '..', '..', 'uploads'), { recursive: true });
			const fileName = `upload_officers_${Date.now()}.csv`;
			tempFilePath = path.join(__dirname, '..', '..', 'uploads', fileName);
			const buffer = Buffer.from(base64Data, 'base64');
			await fs.promises.writeFile(tempFilePath, buffer);
			req.file = { path: tempFilePath, originalname: fileName, mimetype: detectedMime };
			createdTempFile = true;
			console.log('[uploadOfficers] Created temp file from request body:', tempFilePath);
		} catch (err) {
			console.error('[uploadOfficers] Failed to create temp file from body:', err);
		}
	}

	if (!req.file) {
		console.error('[uploadOfficers] No file found. content-type:', req.headers['content-type']);
		return res.status(400).json({
			success: false,
			message: 'No file uploaded. Send multipart/form-data (file field) or raw CSV (Content-Type: text/csv).'
		});
	}

	const allowedMime = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']);
	const originalName = req.file.originalname || '';
	const extIsCsv = originalName.toLowerCase().endsWith('.csv');

	if (!allowedMime.has(req.file.mimetype) && !extIsCsv) {
		fs.promises.unlink(req.file.path).catch(()=>{});
		if (createdTempFile && tempFilePath) fs.promises.unlink(tempFilePath).catch(()=>{});
		return res.status(400).json({ success: false, message: `Invalid file type. Detected mimetype=${req.file.mimetype}` });
	}

	const filePath = req.file.path;
	const rows = [];
	let connection;
	const summary = { totalRows: 0, inserted: 0, updated: 0, deleted: 0, unassigned: 0, skipped: 0, failed: 0 };

	try {
		// Read CSV
		await new Promise((resolve, reject) => {
			fs.createReadStream(filePath)
				.pipe(csv({ bom: true, mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
				.on('data', data => rows.push(data))
				.on('end', resolve)
				.on('error', reject);
		});

		if (!rows || rows.length === 0) {
			try { await fs.promises.unlink(filePath); } catch(e){/*ignore*/ }
			return res.status(400).json({ success: false, message: 'CSV file empty or headers invalid.' });
		}

		summary.totalRows = rows.length;

		connection = await pool.getConnection();
		await connection.beginTransaction();

		const uploaderId = req.user?.userId;
		if (!uploaderId) {
			await connection.release();
			return res.status(401).json({ success: false, message: 'Unauthorized: uploader not identified from token.' });
		}

		// Preload organizations and officers (locked) to perform replace-by-uploader logic
		const [orgRows] = await connection.query('SELECT OrgID, OrgName FROM Organizations FOR UPDATE');
		// Map by OrgID (string) because CSV now provides OrgID
		const orgById = new Map(orgRows.map(r => [ String(r.OrgID), r ]));

		const [offRows] = await connection.query('SELECT OfficerID, Email AS OfficerEmail, OfficerPhone, AdminUserID FROM Officers FOR UPDATE');
		// Map by email and by phone (normalized) for duplicate checks
		const officerByEmail = new Map(offRows.filter(r => r.OfficerEmail).map(r => [ (r.OfficerEmail||'').trim().toLowerCase(), r ] ));
		const normalizePhone = (p) => p ? String(p).replace(/\D/g,'') : '';
		const officerByPhone = new Map();
		for (const r of offRows) {
			const p = normalizePhone(r.OfficerPhone);
			if (p) officerByPhone.set(p, r);
		}

		// collect existing officers owned by uploader
		const existingUploaderOfficerIds = new Set(offRows.filter(r => String(r.AdminUserID) === String(uploaderId)).map(r => String(r.OfficerID)));

		const processedOfficerIds = new Set();
		const seenEmails = new Set();
		const seenPhones = new Set();

		// helper to respond with error: rollback, release connection, cleanup uploaded file, and send response
		const respondWithError = async (status, message) => {
			try { if (connection) { await connection.rollback(); } } catch (e) { /* ignore */ }
			try { if (connection) { connection.release(); } } catch (e) { /* ignore */ }
			try { await fs.promises.unlink(filePath); } catch (e) { /* ignore */ }
			return res.status(status).json({ success: false, message });
		};

		// helper: convert status values — accept numeric values only, otherwise null
		function parseStatusToFlag(val) {
			if (val == null) return null;
			const sRaw = String(val).trim();
			if (sRaw === '') return null;

			// If pure integer numeric, return numeric value (0,1,...)
			if (/^-?\d+$/.test(sRaw)) {
				return Number(sRaw);
			}

			// Do not map textual values — user provides numeric values
			return null;
		}

		for (let i = 0; i < rows.length; i++) {
			// per-row processing with local try/catch so one bad row doesn't abort everything
			try {
				const r = rows[i];
				const rowNum = i + 2;
				const OfficerName = r.OfficerName ? String(r.OfficerName).trim() : '';
				const OfficerPhone = r.OfficerPhone ? String(r.OfficerPhone).trim() : null;
				const OfficerPhoneNorm = normalizePhone(OfficerPhone);
				const OfficerEmail = r.OfficerEmail ? String(r.OfficerEmail).trim().toLowerCase() : '';
				const OfficerStatus = parseStatusToFlag(r.OfficerStatus);
				// CSV now provides OrgID (numeric)
				const OrgIDraw = r.OrgID ? String(r.OrgID).trim() : null;
				let OrgID = null;

				// validation
				if (!OfficerName) throw new Error(`Error on row ${rowNum}: OfficerName is required.`);
				if (!OfficerEmail || !validator.isEmail(OfficerEmail)) throw new Error(`Error on row ${rowNum}: valid OfficerEmail is required.`);
				// duplicate email in CSV -> return error
				if (seenEmails.has(OfficerEmail)) {
					return await respondWithError(400, `Duplicate email in CSV at row ${rowNum}: ${OfficerEmail}`);
				}
				seenEmails.add(OfficerEmail);

				// duplicate phone in CSV -> return error
				if (OfficerPhoneNorm) {
					if (seenPhones.has(OfficerPhoneNorm)) {
						return await respondWithError(400, `Duplicate phone in CSV at row ${rowNum}: ${OfficerPhone}`);
					}
					seenPhones.add(OfficerPhoneNorm);
				}

				// determine OrgID from CSV:
				if (OrgIDraw) {
					if (!/^\d+$/.test(OrgIDraw)) throw new Error(`Error on row ${rowNum}: OrgID must be numeric.`);
					// check cached by id
					if (orgById.has(OrgIDraw)) {
						OrgID = orgById.get(OrgIDraw).OrgID;
					} else {
						// check DB just in case
						const [matchRows] = await connection.query('SELECT OrgID FROM Organizations WHERE OrgID = ? LIMIT 1', [OrgIDraw]);
						if (matchRows && matchRows.length > 0) {
							OrgID = matchRows[0].OrgID;
							orgById.set(OrgIDraw, { OrgID });
						} else {
							// create organization with specified OrgID (insert with OrgID)
							console.log(`[uploadOfficers] row ${rowNum}: creating organization with OrgID='${OrgIDraw}' for uploader ${uploaderId}`);
							// Ensure OrgName is not NULL: use a placeholder name derived from OrgID
							const placeholderOrgName = `Org ${OrgIDraw}`;
							await connection.query(
								'INSERT INTO Organizations (OrgID, OrgName, OrgDescription, AdminUserID) VALUES (?, ?, ?, ?)',
								[OrgIDraw, placeholderOrgName, null, uploaderId]
							);
							OrgID = Number(OrgIDraw);
							orgById.set(OrgIDraw, { OrgID, OrgName: placeholderOrgName });
						}
					}
				} else {
					OrgID = null;
				}

				// check existing officer by email
				const existingOfficer = officerByEmail.get(OfficerEmail);
				// Phone conflict checks:
				if (OfficerPhoneNorm) {
					const conflict = officerByPhone.get(OfficerPhoneNorm);
					if (existingOfficer) {
						// updating: if phone exists and belongs to different officer -> error
						if (conflict && String(conflict.OfficerID) !== String(existingOfficer.OfficerID)) {
							return await respondWithError(400, `Phone already used by another officer (row ${rowNum}): ${OfficerPhone}`);
						}
					} else {
						// inserting: if phone exists -> error
						if (conflict) {
							return await respondWithError(400, `Phone already used by another officer (row ${rowNum}): ${OfficerPhone}`);
						}
					}
				}

				if (existingOfficer) {
					console.log(`[uploadOfficers] row ${rowNum}: updating officer ${existingOfficer.OfficerID} (${OfficerEmail})`);
					// update and assign to uploader (transfer if necessary)
					await connection.query(
					'UPDATE Officers SET OfficerName = ?, OfficerPhone = ?, Email = ?, AdminUserID = ?, OrgID = ? WHERE OfficerID = ?',
						[OfficerName, OfficerPhone, OfficerEmail, uploaderId, OrgID, existingOfficer.OfficerID]
					);
					processedOfficerIds.add(String(existingOfficer.OfficerID));
					summary.updated++;
				} else {
					console.log(`[uploadOfficers] row ${rowNum}: inserting officer (${OfficerEmail})`);
					// insert new officer (generate temporary password)
					// NOTE: in production you should hash this password and notify the user to reset it.
					const defaultPassword = crypto.randomBytes(8).toString('hex'); // 16 hex chars
						const insertSql = 'INSERT INTO Officers (OfficerName, OfficerPhone, Email, OfficerPassword, AdminUserID, OrgID) VALUES (?, ?, ?, ?, ?, ?)';
					const insertParams = [OfficerName, OfficerPhone, OfficerEmail, defaultPassword, uploaderId, OrgID];
					console.log('[uploadOfficers] insert SQL:', insertSql, insertParams);
					const [insOff] = await connection.query(insertSql, insertParams);
					
					processedOfficerIds.add(String(insOff.insertId));
					summary.inserted++;
				}
			} catch (rowErr) {
				const rowNum = i + 2;
				console.error(`[uploadOfficers] Error processing row ${rowNum}:`, rowErr.stack || rowErr);
				summary.failed++;
				// continue processing remaining rows
				continue;
			}
		}

		// Remove officers previously owned by uploader but not present in CSV.
		// If deletion fails due to FK constraints, fall back to unassigning (AdminUserID = NULL).
		const toRemove = Array.from(existingUploaderOfficerIds).filter(id => !processedOfficerIds.has(id));
		if (toRemove.length > 0) {
			try {
				const [delRes] = await connection.query('DELETE FROM Officers WHERE OfficerID IN (?)', [toRemove]);
				summary.deleted = typeof delRes.affectedRows === 'number' ? delRes.affectedRows : toRemove.length;
				summary.unassigned = 0;
			} catch (delErr) {
				// Likely FK constraint. Try to unassign (set AdminUserID = NULL) instead.
				console.warn('[uploadOfficers] delete failed, attempting to unassign officers instead:', delErr.message);
				try {
					const [updRes] = await connection.query('UPDATE Officers SET AdminUserID = NULL WHERE OfficerID IN (?)', [toRemove]);
					summary.unassigned = typeof updRes.affectedRows === 'number' ? updRes.affectedRows : toRemove.length;
					summary.deleted = 0;
				} catch (updErr) {
					// If even unassign fails, throw to rollback entire transaction
					throw new Error(`Failed to remove or unassign dependent officers: ${updErr.message}`);
				}
			}
		} else {
			summary.deleted = 0;
			summary.unassigned = 0;
		}

		await connection.commit();

		// --- Save uploaded file to files/manageofficers/{uploaderId}/ ---
		try {
			if (uploaderId) {
				const targetDir = path.join(__dirname, '..', '..', 'files', 'manageofficers', String(uploaderId));
				await fs.promises.mkdir(targetDir, { recursive: true });

				// Helper: clear target directory but optionally keep some source paths
				async function clearDirectory(dir, keepPaths = new Set()) {
					try {
						const entries = await fs.promises.readdir(dir);
						for (const entry of entries) {
							const entryPath = path.join(dir, entry);
							const resolved = path.resolve(entryPath);
							if (keepPaths.has(resolved)) continue;
							try {
								const st = await fs.promises.stat(entryPath);
								if (st.isDirectory()) {
									await fs.promises.rm(entryPath, { recursive: true, force: true }).catch(()=>{});
								} else {
									await fs.promises.unlink(entryPath).catch(()=>{});
								}
							} catch (e) {
								// ignore per-entry errors
							}
						}
					} catch (e) {
						// ignore if directory not readable
					}
				}

				// prepare target filename and ensure we don't remove the source file if it's inside the same dir
				const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
				const targetFile = path.join(targetDir, `officers_${timestamp}.csv`);

				// If the uploaded file (filePath) happens to be inside targetDir, keep it during clearing
				const keep = new Set();
				try { keep.add(path.resolve(filePath)); } catch(e) {}

				// Clear existing files in targetDir before copying new one
				await clearDirectory(targetDir, keep);

				// Now copy uploaded file to the target location
				await fs.promises.copyFile(filePath, targetFile);
			}
		} catch (copyErr) {
			console.error('[uploadOfficers] Failed to archive uploaded file:', copyErr);
		}

// Regenerate canonical officers CSV for this uploader and try to return latestPath
        try {
            const writeOfficersCSV = require('./writeOfficersCSV');
            console.log(`Invoking writeOfficersCSV after upload for uploader=${uploaderId}`);
            const { latestPath } = await writeOfficersCSV(req.pool, uploaderId)();
            console.log(`✅ writeOfficersCSV after upload: wrote latestPath=${latestPath}`);
            return res.status(200).json({ success: true, message: 'Officers synchronized successfully.', summary, latestPath });
        } catch (err) {
            console.error('writeOfficersCSV after upload failed:', err && (err.stack || err.message || err));
            // Retry with fresh pool
            try {
                const mysql = require('mysql2/promise');
                const tmpPool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
                const { latestPath: retryPath } = await require('./writeOfficersCSV')(tmpPool, uploaderId)();
                console.log(`✅ writeOfficersCSV retry after upload succeeded: ${retryPath}`);
                await tmpPool.end();
                // Schedule a background write to be extra safe
                setImmediate(() => {
                    (async () => {
                        try {
                            const mysql2 = require('mysql2/promise');
                            const bgPool = await mysql2.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
                            await require('./writeOfficersCSV')(bgPool, uploaderId)();
                            await bgPool.end();
                            console.log('✅ background writeOfficersCSV after upload succeeded');
                        } catch (bgErr) {
                            console.error('❌ background writeOfficersCSV after upload failed:', bgErr && (bgErr.stack || bgErr.message || bgErr));
                        }
                    })();
                });
                return res.status(200).json({ success: true, message: 'Officers synchronized successfully.', summary, latestPath: retryPath });
            } catch (retryErr) {
                console.error('writeOfficersCSV retry after upload failed:', retryErr && (retryErr.stack || retryErr.message || retryErr));
                // Fire-and-forget background attempts to ensure eventual consistency
                setImmediate(() => {
                    (async () => {
                        try {
                            const mysql3 = require('mysql2/promise');
                            const pool3 = await mysql3.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
                            await require('./writeOfficersCSV')(pool3, uploaderId)();
                            await pool3.end();
                            console.log('✅ background final writeOfficersCSV after upload succeeded');
                        } catch (bgErr) {
                            console.error('❌ background final writeOfficersCSV after upload failed:', bgErr && (bgErr.stack || bgErr.message || bgErr));
                        }
                    })();
                });
                return res.status(200).json({ success: true, message: 'Officers synchronized successfully.', summary, latestPath: null, writerError: (retryErr && (retryErr.stack || retryErr.message || String(retryErr))) });
            }
        }

	} catch (err) {
		if (connection) {
			try { await connection.rollback(); } catch(e) { console.error('Rollback error:', e); }
		}
		summary.failed = summary.totalRows - (summary.inserted + summary.updated);
		// Log full stack for debugging
		console.error('❌ uploadOfficers error:', err.stack || err);
		return res.status(500).json({ success: false, message: 'Internal Server Error', detail: err.message, summary });
	} finally {
		if (connection) {
			try { connection.release(); } catch(e) { console.error('Connection release error:', e); }
		}
		try { await fs.promises.access(filePath); await fs.promises.unlink(filePath); } catch(e) { /* ignore */ }
		try { if (createdTempFile && tempFilePath) await fs.promises.unlink(tempFilePath); } catch(e){/*ignore*/ }
	}
};

module.exports = uploadOfficersService;
