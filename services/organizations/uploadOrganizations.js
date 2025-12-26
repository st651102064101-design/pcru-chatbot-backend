const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

/**
 * Service to handle bulk upload of Organizations from a CSV file.
 * This function assumes it's being used after a multer middleware.
 * @returns {function} - Express Middleware (req, res).
 */
const uploadOrganizationsService = (pool) => async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    if (req.file.mimetype !== 'text/csv' && !req.file.originalname.endsWith('.csv')) {
        return res.status(400).json({ success: false, message: 'Invalid file type. Please upload a CSV file.' });
    }

    const results = [];
    const summary = { totalRowsInCSV: 0, inserted: 0, updated: 0, unchanged: 0, deleted: 0, skipped_deletion: 0, failed: 0 };
    let connection;
    let filePath;

    // duplicates flags: allowDuplicates (upsert), allowExactDuplicates (insert duplicates even if OrgName exists)
    const allowDuplicates = (String(req.body?.allowDuplicates || req.query?.allowDuplicates || '').toLowerCase() === 'true') || (req.body?.allowDuplicates === '1') || (req.query?.allowDuplicates === '1');
    const allowExactDuplicates = (String(req.body?.allowExactDuplicates || req.query?.allowExactDuplicates || '').toLowerCase() === 'true') || (req.body?.allowExactDuplicates === '1') || (req.query?.allowExactDuplicates === '1');
    console.log('[uploadOrganizations] allowDuplicates:', allowDuplicates, 'allowExactDuplicates:', allowExactDuplicates);

    try {
        const uploaderId = req.user?.userId;
        if (!uploaderId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the uploader from the token.' });
        }

        // เตรียมโฟลเดอร์และไฟล์
        const userSpecificDir = path.join(__dirname, '..', '..', 'files', 'manageorganizations', uploaderId.toString());
        await fs.promises.mkdir(userSpecificDir, { recursive: true });

        // ลบไฟล์เก่าทั้งหมดในไดเรกทอรีของผู้ใช้
        const existingFiles = await fs.promises.readdir(userSpecificDir);
        for (const file of existingFiles) {
            await fs.promises.unlink(path.join(userSpecificDir, file));
        }

        filePath = path.join(userSpecificDir, req.file.originalname);
        // Support both memoryStorage (req.file.buffer) and diskStorage (req.file.path)
        if (req.file.buffer && req.file.buffer.length >= 0) {
            await fs.promises.writeFile(filePath, req.file.buffer);
        } else if (req.file.path) {
            // copy from the temp path to our user directory
            await fs.promises.copyFile(req.file.path, filePath);
        } else {
            return res.status(400).json({ success: false, message: 'Uploaded file has no readable content.' });
        }

        // อ่าน CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ 
                    bom: true,
                    mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') 
                }))
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        summary.totalRowsInCSV = results.length;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. ดึงข้อมูลองค์กรเดิมของ uploader (ตามลำดับ OrgID)
        const [dbOrgRows] = await connection.query(
            'SELECT OrgID FROM Organizations WHERE AdminUserID = ? ORDER BY OrgID ASC FOR UPDATE',
            [uploaderId]
        );

        // 2. อัปเดต/เพิ่มข้อมูลตามลำดับแถวในไฟล์
        for (let i = 0; i < results.length; i++) {
            const csvOrg = results[i];
            const dbOrg = dbOrgRows[i];

            if (dbOrg) {
                // UPDATE (แทนที่ข้อมูลเดิม)
                // ต้อง handle กรณี unique constraint: ถ้าชื่อใหม่ซ้ำกับแถวอื่นใน DB ที่ไม่ใช่แถวนี้ ให้ข้ามหรือเปลี่ยนชื่อ
                try {
                    await connection.query(
                        'UPDATE Organizations SET OrgName = ?, OrgDescription = ? WHERE OrgID = ?',
                        [csvOrg.OrgName, csvOrg.OrgDescription || '', dbOrg.OrgID]
                    );
                    summary.updated++;
                } catch (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        if (allowExactDuplicates) {
                            // If duplicates allowed, instead insert a new row for this CSV entry and keep the original row as-is
                            try {
                                await connection.query(
                                    'INSERT INTO Organizations (OrgName, OrgDescription, AdminUserID) VALUES (?, ?, ?)',
                                    [csvOrg.OrgName, csvOrg.OrgDescription || '', uploaderId]
                                );
                                summary.inserted++;
                                console.warn('[uploadOrganizations] Update produced duplicate but allowExactDuplicates=true. Inserted duplicate instead.');
                            } catch (innerErr) {
                                // If insert still fails, count as failed
                                summary.failed++;
                                console.error('[uploadOrganizations] Failed to insert duplicate after update conflict:', innerErr && innerErr.message ? innerErr.message : innerErr);
                            }
                            continue;
                        }
                        summary.failed++;
                        continue; // ข้ามแถวนี้
                    } else {
                        throw err;
                    }
                }
            } else {
                // INSERT
                try {
                    await connection.query(
                        'INSERT INTO Organizations (OrgName, OrgDescription, AdminUserID) VALUES (?, ?, ?)',
                        [csvOrg.OrgName, csvOrg.OrgDescription || '', uploaderId]
                    );
                    summary.inserted++;
                } catch (err) {
                    if (err.code === 'ER_DUP_ENTRY') {                        if (allowExactDuplicates) {
                            // If database still enforces uniqueness (migration not applied), attempt an INSERT ignoring conflict by appending a small suffix.
                            // NOTE: This is a fallback — prefer running the migration to drop unique constraint.
                            try {
                                const suffix = '-dup-'+Date.now();
                                await connection.query(
                                    'INSERT INTO Organizations (OrgName, OrgDescription, AdminUserID) VALUES (?, ?, ?)',
                                    [csvOrg.OrgName + suffix, csvOrg.OrgDescription || '', uploaderId]
                                );
                                summary.inserted++;
                                console.warn('[uploadOrganizations] Insert conflict but allowExactDuplicates=true. Inserted with suffix to avoid unique constraint.');
                                continue;
                            } catch (innerErr) {
                                summary.failed++;
                                console.error('[uploadOrganizations] Fallback insert failed:', innerErr && innerErr.message ? innerErr.message : innerErr);
                                continue;
                            }
                        }                        summary.failed++;
                        continue; // ข้ามแถวนี้
                    } else {
                        throw err;
                    }
                }
            }
        }

        // 3. ถ้าใน DB มีมากกว่าในไฟล์ ให้ลบแถวส่วนเกิน (โดยต้องไม่ถูกอ้างอิง)
        if (dbOrgRows.length > results.length) {
            const orgsToDelete = dbOrgRows.slice(results.length);
            const idsToDelete = orgsToDelete.map(org => org.OrgID);

            // ตรวจสอบว่า OrgID เหล่านี้ถูกอ้างอิงใน officers หรือไม่
            const [referencedInOfficers] = await connection.query(
                'SELECT DISTINCT OrgID FROM Officers WHERE OrgID IN (?)', [idsToDelete]
            );
            const referencedIds = new Set(referencedInOfficers.map(r => r.OrgID));
            const finalIdsToDelete = idsToDelete.filter(id => !referencedIds.has(id));

            // ลบเฉพาะ OrgID ที่ไม่ถูกอ้างอิง
            if (finalIdsToDelete.length > 0) {
                const { affectedRows } = await connection.query(
                    'DELETE FROM Organizations WHERE OrgID IN (?)', [finalIdsToDelete]
                );
                summary.deleted = affectedRows;
            }

            // จำนวนที่ข้ามการลบเพราะถูกอ้างอิง
            summary.skipped_deletion = idsToDelete.length - finalIdsToDelete.length;
        }

        await connection.commit();

        res.status(200).json({
            success: true,
            message: 'Organizations synchronized successfully.',
            summary
        });

    } catch (error) {
        if (connection) await connection.rollback();
        summary.failed = summary.totalRowsInCSV - (summary.inserted + summary.updated + summary.unchanged);
        res.status(500).json({ success: false, message: error.message, summary });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = uploadOrganizationsService;
