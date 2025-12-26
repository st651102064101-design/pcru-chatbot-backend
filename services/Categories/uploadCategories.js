// services/Categories/uploadCategories.js
// Requires: npm install csv-parser validator
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const validator = require('validator');

const uploadCategoriesService = (pool) => async (req, res) => {
	// Debug
	console.log('[uploadCategories] headers:', {
		authorization: req.headers?.authorization,
		'content-type': req.headers?.['content-type'] || req.headers?.['Content-Type']
	});
	console.log('[uploadCategories] req.file:', req.file, 'req.files:', req.files);

	// Get uploader ID early for directory creation
	const uploaderId = req.user?.userId;
	if (!uploaderId) {
		return res.status(401).json({ success: false, message: 'Unauthorized: uploader not identified from token.' });
	}

	// Create user-specific directory (no 'file' subfolder now)
	const userUploadDir = path.join(__dirname, '..', '..', 'files', 'managecategories', String(uploaderId));
	await fs.promises.mkdir(userUploadDir, { recursive: true });

	// Helper: clear directory (optionally keep one path)
	async function clearUserDir(dir, keepPath = null) {
		try {
			const entries = await fs.promises.readdir(dir);
			for (const entry of entries) {
				const entryPath = path.join(dir, entry);
				try {
					const stat = await fs.promises.stat(entryPath);
					if (stat.isFile()) {
						if (keepPath && path.resolve(entryPath) === path.resolve(keepPath)) {
							// skip deleting the file we plan to keep
							continue;
						}
						await fs.promises.unlink(entryPath).catch(()=>{});
					} else if (stat.isDirectory()) {
						// remove directory recursively
						await fs.promises.rm(entryPath, { recursive: true, force: true }).catch(()=>{});
					}
				} catch(e) {
					// ignore stat/unlink errors per file
				}
			}
		} catch (e) {
			// ignore if directory missing or other issues
		}
	}

	// If multer used upload.any(), pick first file
	if (!req.file && Array.isArray(req.files) && req.files.length > 0) {
		req.file = req.files[0];
		console.log('[uploadCategories] selected req.file from req.files:', req.file.fieldname, req.file.originalname);
	}

	// If file was uploaded via multer to different location, move it to user directory
	let movedFile = false;
	if (req.file && req.file.path) {
		const currentPath = req.file.path;
		const fileName = `upload_categories_${Date.now()}_${req.file.originalname || 'file.csv'}`;
		const newPath = path.join(userUploadDir, fileName);
		
		// Determine if the current path is already in the target user directory
		const alreadyInUserDir = path.resolve(currentPath).includes(path.resolve(path.join('files','managecategories', String(uploaderId))));

		// Clear existing files, but keep currentPath if it's already inside userUploadDir
		await clearUserDir(userUploadDir, alreadyInUserDir ? currentPath : null);

		// Move/rename or copy+delete depending on disk
		if (!alreadyInUserDir) {
			try {
				await fs.promises.rename(currentPath, newPath);
				req.file.path = newPath;
				movedFile = true;
				console.log('[uploadCategories] Moved file from', currentPath, 'to', newPath);
			} catch (moveErr) {
				try {
					await fs.promises.copyFile(currentPath, newPath);
					await fs.promises.unlink(currentPath).catch(() => {});
					req.file.path = newPath;
					movedFile = true;
					console.log('[uploadCategories] Copied and moved file to', newPath);
				} catch (copyErr) {
					console.error('[uploadCategories] Failed to move/copy file:', copyErr);
				}
			}
		} else {
			// Already in the correct directory: optionally normalize filename
			if (path.resolve(currentPath) !== path.resolve(newPath)) {
				try {
					await fs.promises.rename(currentPath, newPath);
					req.file.path = newPath;
					console.log('[uploadCategories] Renamed existing file in user dir to', newPath);
				} catch (renameErr) {
					// if rename fails, keep currentPath
					req.file.path = currentPath;
					console.log('[uploadCategories] Keeping existing file path in user dir:', currentPath);
				}
			} else {
				req.file.path = currentPath;
			}
		}
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
			const fileName = `upload_categories_${Date.now()}.csv`;
			tempFilePath = path.join(userUploadDir, fileName);

			// Remove previous files in the user dir before writing the new one
			await clearUserDir(userUploadDir);

			const buffer = Buffer.from(base64Data, 'base64');
			await fs.promises.writeFile(tempFilePath, buffer);
			req.file = { path: tempFilePath, originalname: fileName, mimetype: detectedMime };
			createdTempFile = true;
			console.log('[uploadCategories] Created temp file from request body:', tempFilePath);
		} catch (err) {
			console.error('[uploadCategories] Failed to create temp file from body:', err);
		}
	}

	if (!req.file) {
		console.error('[uploadCategories] No file found. content-type:', req.headers['content-type']);
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
	let lastMainCategoryId = null;
	const parentChildCounter = new Map();
	let mainCategoryCounter = 1; // เริ่มนับหมวดหมู่หลักจาก 1
	const summary = { totalRows: 0, inserted: 0, updated: 0, failed: 0, skipped: 0 };

	// Read CSV file and normalize incoming rows
	try {
		await new Promise((resolve, reject) => {
		fs.createReadStream(filePath)
			.pipe(csv({ bom: true, mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') }))
			.on('data', data => {
				const cleanedData = {};
				for (const [key, value] of Object.entries(data)) {
					if (typeof value === 'string') {
						let cleaned = value.trim();
						cleaned = cleaned.replace(/^=["'](.*)["']$/, '$1');
						cleaned = cleaned.replace(/^=["']/, '');
						cleaned = cleaned.replace(/["']$/, '');
						cleanedData[key] = cleaned.trim();
					} else {
						cleanedData[key] = value;
					}
				}
				rows.push(cleanedData);
			})
			.on('end', resolve)
			.on('error', reject);
		});
	}catch(err){
		console.warn('[uploadCategories] Preprocess CSV read failed:', err && err.message ? err.message : err);
		if (createdTempFile && tempFilePath) fs.promises.unlink(tempFilePath).catch(()=>{});
		return res.status(400).json({ success: false, message: 'Failed to read CSV file.' });
	}

	// Main processing (try/catch temporarily removed for stability)
	
		if (!rows || rows.length === 0) {
			try { await fs.promises.unlink(filePath); } catch(e){/*ignore*/ }
			return res.status(400).json({ success: false, message: 'CSV file empty or headers invalid.' });
		}

			// ------------------- Preprocess & duplicate/similarity scan -------------------
			const { similarity } = require('../../utils/fuzzyMatch');
			// Allow duplicates toggles:
			// - allowDuplicates=true (legacy): previously used ON DUPLICATE KEY UPDATE (upsert). After migration this may insert if no unique key exists.
			// - allowExactDuplicates=true: INSERT duplicate rows even if CategoriesID already exists (new behavior after adding surrogate PK)
			const allowDuplicates = (String(req.body?.allowDuplicates || req.query?.allowDuplicates || '').toLowerCase() === 'true') || (req.body?.allowDuplicates === '1') || (req.query?.allowDuplicates === '1');
			const allowExactDuplicates = (String(req.body?.allowExactDuplicates || req.query?.allowExactDuplicates || '').toLowerCase() === 'true') || (req.body?.allowExactDuplicates === '1') || (req.query?.allowExactDuplicates === '1');
			console.log('[uploadCategories] allowDuplicates:', allowDuplicates, 'allowExactDuplicates:', allowExactDuplicates);
			const warnings = []; // collect non-fatal notices when a duplicates-tolerant mode is enabled

			// Normalize all rows first so we can detect duplicates/similar rows ahead of inserting
			const normalizedRows = [];
			for (let i = 0; i < rows.length; i++) {
				const r = rows[i];
				const rowNum = i + 1; // keep user-friendly 1-based row index for report

				let CategoriesID = r.CategoriesID ? String(r.CategoriesID).trim() : '';
				let CategoriesName = r.CategoriesName ? String(r.CategoriesName).trim() : '';
				let CategoriesPDF = r.CategoriesPDF ? String(r.CategoriesPDF).trim() : null;

				// Clean Excel formatting
				CategoriesID = CategoriesID.replace(/^=["'](.*)["']$/, '$1').replace(/^=["']/, '').replace(/["']$/, '').trim();
				CategoriesName = CategoriesName.replace(/^=["'](.*)["']$/, '$1').replace(/^=["']/, '').replace(/["']$/, '').trim();
				if (CategoriesPDF) CategoriesPDF = CategoriesPDF.replace(/^=["'](.*)["']$/, '$1').replace(/^=["']/, '').replace(/["']$/, '').trim();

				// Handle swapped-template case (ID and Name swapped)
				if ((!CategoriesID || CategoriesID === '') && CategoriesName) {
					const idLike = /^\d+(-.+)?$/.test(CategoriesName) || /^[0-9]+$/.test(CategoriesName);
					const parentName = r.ParentCategoriesID ? String(r.ParentCategoriesID).trim() : '';
					if (idLike && parentName) {
						CategoriesID = CategoriesName;
						CategoriesName = parentName;
						console.log('[uploadCategories] Detected swapped columns; treating CategoriesName as CategoriesID and ParentCategoriesID as CategoriesName for row', rowNum);
					}
				}

				// Normalize Thai months like earlier
				const thaiMonths = {
					'ม.ค.': '1', 'ก.พ.': '2', 'มี.ค.': '3', 'เม.ย.': '4', 'พ.ค.': '5', 'มิ.ย.': '6',
					'ก.ค.': '7', 'ส.ค.': '8', 'ก.ย.': '9', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12'
				};
				const monthMatch = CategoriesID.match(/^(\d+)\-([ก-๙\.]+)$/);
				if (monthMatch && thaiMonths[monthMatch[2]]) {
					CategoriesID = `${monthMatch[1]}-${thaiMonths[monthMatch[2]]}`;
				}

				const isLevel0 = CategoriesID && !CategoriesID.includes('-');
				const ParentCategoriesID = isLevel0 ? CategoriesID : (CategoriesID ? CategoriesID.split('-')[0] : '');

				// Determine if this row should be skipped (both ID and Name missing)
				const skip = (!CategoriesID && !CategoriesName);
				normalizedRows.push({ rowNum, CategoriesID, CategoriesName, CategoriesPDF, ParentCategoriesID, isLevel0, skip });
		}

			console.log('[uploadCategories] Normalized rows count:', normalizedRows.length, 'sample:', normalizedRows.slice(0,3));

			// Scan for duplicates and near-similar names
			const conflicts = [];
			if (!allowExactDuplicates) {
				const idMap = new Map();
				const nameParentMap = new Map();

				for (const nr of normalizedRows) {
					if (nr.skip) continue;
					if (nr.CategoriesID) {
						idMap.set(nr.CategoriesID, (idMap.get(nr.CategoriesID) || []).concat(nr.rowNum));
					}
					const nameKey = `${(nr.CategoriesName||'').toLowerCase().trim()}||${nr.ParentCategoriesID || ''}`;
					nameParentMap.set(nameKey, (nameParentMap.get(nameKey) || []).concat(nr.rowNum));
				}

				for (const [id, rowsList] of idMap.entries()) {
					if (rowsList.length > 1) {
						// include row details for UI to show exact values
						const rowsDetail = rowsList.map(rn => normalizedRows.find(n => n.rowNum === rn) || { rowNum: rn });
						conflicts.push({ type: 'duplicate-id', field: 'CategoriesID', value: id, rows: rowsList, rowsDetail, description: `พบ CategoriesID ซ้ำ "${id}" ในแถว ${rowsList.join(', ')}` });
					}
				}

				for (const [k, rowsList] of nameParentMap.entries()) {
					if (rowsList.length > 1) {
						const parts = k.split('||');
						const rowsDetail = rowsList.map(rn => normalizedRows.find(n => n.rowNum === rn) || { rowNum: rn });
						conflicts.push({ type: 'duplicate-name-parent', field: 'CategoriesName & ParentCategoriesID', value: parts[0], parent: parts[1], rows: rowsList, rowsDetail, description: `พบชื่อหมวดหมู่และ parent ซ้ำ "${parts[0]}" (parent=${parts[1] || 'ว่าง'}) ในแถว ${rowsList.join(', ')}` });
					}
				}

				// fuzzy similarity detection for names (threshold 0.85)
				const threshold = 0.85;
				for (let i = 0; i < normalizedRows.length; i++) {
					for (let j = i + 1; j < normalizedRows.length; j++) {
						const a = normalizedRows[i];
						const b = normalizedRows[j];
						if (a.skip || b.skip) continue;
						if (!a.CategoriesName || !b.CategoriesName) continue;
						const score = similarity(a.CategoriesName, b.CategoriesName);
						if (score >= threshold && a.CategoriesID !== b.CategoriesID) {
							const rowsDetail = [
								{ rowNum: a.rowNum, CategoriesID: a.CategoriesID, CategoriesName: a.CategoriesName, ParentCategoriesID: a.ParentCategoriesID },
								{ rowNum: b.rowNum, CategoriesID: b.CategoriesID, CategoriesName: b.CategoriesName, ParentCategoriesID: b.ParentCategoriesID }
							];
							conflicts.push({ type: 'similar-name', field: 'CategoriesName', rows: [a.rowNum, b.rowNum], rowsDetail, valueA: a.CategoriesName, valueB: b.CategoriesName, similarity: score, description: `พบชื่อหมวดหมู่คล้ายกันแถว ${a.rowNum} และ ${b.rowNum}: "${a.CategoriesName}" <> "${b.CategoriesName}" (ความคล้าย ${Math.round(score*100)}%)` });
						}
					}
				}
			} else {
				// duplicates allowed: do not pre-check for duplicate ids/names; keep conflicts empty (we will insert duplicates)
			}

			// If duplicates mode enabled, convert conflicts to warnings and clear conflicts so upload proceeds
			if (conflicts.length > 0 && (allowExactDuplicates || allowDuplicates)) {
				warnings.push(...conflicts);
				console.warn('[uploadCategories] Conflicts converted to warnings due to duplicates-mode:', { allowExactDuplicates, allowDuplicates, conflictsCount: conflicts.length });
				conflicts.length = 0;
			}

			// If there are conflicts AND duplicates-modes are NOT enabled, abort with UI hint
			if (conflicts.length > 0 && !(allowExactDuplicates || allowDuplicates)) {
				if (createdTempFile && tempFilePath) fs.promises.unlink(tempFilePath).catch(()=>{});
				console.warn('[uploadCategories] Aborting upload due to conflicts:', conflicts);
				const highlightRows = Array.from(new Set(conflicts.flatMap(c => (c.rows || []).slice(0)))).sort((a,b)=>a-b);
				return res.status(400).json({
					success: false,
					errorType: 'duplicate_data',
					message: 'พบแถวที่ซ้ำหรือมีความคล้ายคลึงกันในไฟล์ CSV ที่อัปโหลด กรุณาตรวจสอบแถว/คอลัมน์ที่ถูกเน้นก่อนนำเข้า',
					message_th: 'พบแถวที่ซ้ำหรือมีความคล้ายคลึงกันในไฟล์ CSV ที่อัปโหลด กรุณาตรวจสอบแถว/คอลัมน์ที่ถูกเน้นก่อนนำเข้า',
					message_en: 'Duplicate or very similar rows detected in uploaded CSV. Please review the highlighted rows/columns before importing.',
					conflictsCount: conflicts.length,
					conflicts,
					ui: {
						title: 'อัปโหลดล้มเหลว: พบข้อมูลซ้ำ/คล้าย',
						description: 'รายการด้านล่างแสดงแถวและคอลัมน์ที่ซ้ำหรือคล้ายกัน กรุณาตรวจสอบและแก้ไขก่อนนำเข้า',
						size: 'large', // hint for frontend to use a large modal or banner
						severity: 'error',
						highlightRows
					}
				});
			} else {
				// If duplicates mode enabled and conflicts were found, convert them to warnings and continue
				if (conflicts.length > 0) {
					warnings.push(...conflicts);
					console.warn('[uploadCategories] Conflicts converted to warnings due to duplicates-mode, continuing:', { allowExactDuplicates, allowDuplicates, conflictsCount: conflicts.length });
				}

				// Proceed with insert
				summary.totalRows = normalizedRows.filter(r=>!r.skip).length;
			}

			try {
				connection = await pool.getConnection();
				await connection.beginTransaction();

				// Determine owner OfficerID for categories: if uploader is an Officer use their ID, otherwise (Admin) categories are global (OfficerID = NULL)
				const uploaderId = req.user?.userId;
				const ownerOfficerId = (req.user && req.user.usertype === 'Officer') ? uploaderId : null;

				if (allowDuplicates || allowExactDuplicates) {
					// When allowing duplicates or exact-duplicates, preserve existing categories; we'll insert or upsert as requested
					console.log('[uploadCategories] duplicates-mode enabled: preserving existing categories (mode: ' + (allowExactDuplicates ? 'insert-duplicates' : 'upsert') + ')');
				} else {
					if (ownerOfficerId === null) {
						// delete global categories (OfficerID IS NULL)
						await connection.query('DELETE FROM Categories WHERE OfficerID IS NULL');
					} else {
						await connection.query('DELETE FROM Categories WHERE OfficerID = ?', [ownerOfficerId]);
					}
				}

				const insertedIds = new Set(); // เก็บ CategoriesID ที่ถูก INSERT จาก CSV

				// iterate normalized rows for insertion
				for (let i = 0; i < normalizedRows.length; i++) {
					try {
						const nr = normalizedRows[i];
						if (nr.skip) { summary.skipped++; continue; }
						let CategoriesID = nr.CategoriesID;
						let CategoriesName = nr.CategoriesName;
						let CategoriesPDF = nr.CategoriesPDF || null;

						// Normalize CategoriesID when Excel auto-formats to Thai month names (e.g., 1-ม.ค.) — already handled but safe to keep
						const thaiMonths = {
							'ม.ค.': '1', 'ก.พ.': '2', 'มี.ค.': '3', 'เม.ย.': '4', 'พ.ค.': '5', 'มิ.ย.': '6',
							'ก.ค.': '7', 'ส.ค.': '8', 'ก.ย.': '9', 'ต.ค.': '10', 'พ.ย.': '11', 'ธ.ค.': '12'
						};
						const monthMatch = CategoriesID.match(/^(\d+)\-([ก-๙\.]+)$/);
						if (monthMatch && thaiMonths[monthMatch[2]]) {
							CategoriesID = `${monthMatch[1]}-${thaiMonths[monthMatch[2]]}`;
						}

						if (!CategoriesID || !CategoriesName) {
							summary.skipped++;
							continue;
						}

						// ตรวจสอบว่าเป็น Level 0 หรือ Level 1 จาก format ของ CategoriesID
						const isLevel0 = !CategoriesID.includes('-'); // ถ้าไม่มี "-" แสดงว่าเป็น Level 0
						const ParentCategoriesID = isLevel0 ? CategoriesID : CategoriesID.split('-')[0]; // ถ้า Level 1 ใช้ส่วนแรกก่อน "-" เป็น parent

						console.log('[uploadCategories] row', nr.rowNum, '->', { CategoriesID, CategoriesName, ParentCategoriesID, CategoriesPDF, ownerOfficerId });
					const insertSql = allowExactDuplicates
						? 'INSERT INTO Categories (CategoriesID, CategoriesName, ParentCategoriesID, CategoriesPDF, OfficerID) VALUES (?, ?, ?, ?, ?)'
						: (allowDuplicates
							? 'INSERT INTO Categories (CategoriesID, CategoriesName, ParentCategoriesID, CategoriesPDF, OfficerID) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE CategoriesName = VALUES(CategoriesName), ParentCategoriesID = VALUES(ParentCategoriesID), CategoriesPDF = VALUES(CategoriesPDF), OfficerID = VALUES(OfficerID)'
							: 'INSERT INTO Categories (CategoriesID, CategoriesName, ParentCategoriesID, CategoriesPDF, OfficerID) VALUES (?, ?, ?, ?, ?)');
						const params = [CategoriesID, CategoriesName, ParentCategoriesID, CategoriesPDF, ownerOfficerId];
						const [insRes] = await connection.query(insertSql, params);
						console.log('[uploadCategories] insert result:', insRes && typeof insRes.affectedRows === 'number' ? ('affected=' + insRes.affectedRows) : insRes);
						if (allowDuplicates) {
							if (insRes && typeof insRes.affectedRows === 'number') {
								if (insRes.affectedRows === 1) summary.inserted++;
								else if (insRes.affectedRows === 2) summary.updated++;
								else summary.skipped++;
							} else {
								summary.inserted++;
							}
						} else {
							summary.inserted++;
						}
						insertedIds.add(CategoriesID);
						// อัปเดต lastMainCategoryId ถ้าเป็น Level 0
						if (isLevel0) {
							lastMainCategoryId = CategoriesID;
						}
					} catch (rowErr) {
						console.error(`[uploadCategories] Row ${i + 1} failed:`, rowErr.message || rowErr);
						summary.failed++;
						continue;
					}
				}

				await connection.commit();
				// Build response; include warnings if duplicates were allowed
				const response = { success: true, summary };
				if (warnings && warnings.length > 0) response.warnings = warnings;
				if (allowDuplicates) {
					response.message = 'การอัปโหลดเสร็จสมบูรณ์แล้ว (อนุญาตให้มีรายการซ้ำ — แถวบางแถวอาจถูกอัปเดต)';
					response.message_th = response.message;
					response.message_en = 'Upload completed (duplicates allowed — some rows may have been updated).';
				}

				// cleanup temp file if we created one
				if (createdTempFile && tempFilePath) {
					try { await fs.promises.unlink(tempFilePath); } catch(e){}
				}

				res.json(response);
			} catch (e) {
				if (connection) {
					try { await connection.rollback(); } catch(_){}
				}
				console.error('[uploadCategories] Transaction failed:', e && e.message ? e.message : e);
				if (createdTempFile && tempFilePath) fs.promises.unlink(tempFilePath).catch(()=>{});
				return res.status(500).json({ success:false, message: 'Server error while processing upload.' });
			} finally {
				if (connection) try { connection.release(); } catch (_) {}
			}
};

module.exports = uploadCategoriesService;
