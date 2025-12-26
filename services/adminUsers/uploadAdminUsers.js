// services/adminUsers/uploadAdminUsers.js
// --- New Service File ---
// Requires: npm install multer csv-parser validator
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const validator = require('validator');

/**
 * Service to handle bulk upload of Admin Users from a CSV file.
 * This function assumes it's being used after a multer middleware.
 * @param {object} pool - An established MySQL Connection Pool.
 * @returns {function} - Express Middleware (req, res).
 */
const uploadAdminUsersService = (pool) => async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    if (req.file.mimetype !== 'text/csv' && !req.file.originalname.endsWith('.csv')) {
        fs.promises.unlink(req.file.path).catch(err => console.error("Error cleaning up invalid file:", err)); // Clean up uploaded file
        return res.status(400).json({ success: false, message: 'Invalid file type. Please upload a CSV file.' });
    }

    const results = [];
    const filePath = req.file.path;
    let connection;
    // ปรับปรุง summary ให้รองรับการทำงานใหม่
    // นำ 'deleted' และ 'skipped_deletion' กลับมา
    // เพิ่ม updated และเปลี่ยน skipped เป็น unchanged เพื่อความชัดเจน
    const summary = { totalRowsInCSV: 0, inserted: 0, updated: 0, unchanged: 0, deleted: 0, skipped_deletion: 0, failed: 0 };
    
    // ย้ายการประกาศ csvUserMap ออกมานอก try block เพื่อให้ catch block เข้าถึงได้
    const csvUserMap = new Map();

    try {
        // ดึง ID ของผู้ที่ทำการอัปโหลดจาก Token
        const uploaderId = req.user?.userId;
        
        if (!uploaderId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the uploader from the token.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Process CSV file stream into memory
        // (แก้ไข) อ่านไฟล์จากตำแหน่งชั่วคราวเดิม (filePath)
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({ 
                    bom: true,
                    // ทำความสะอาด Header โดยการลบ BOM และช่องว่างที่ไม่จำเป็นออก
                    mapHeaders: ({ header }) => header.trim().replace(/^\uFEFF/, '') 
                }))
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        summary.totalRowsInCSV = results.length;

        // --- (ใหม่) ตรวจสอบข้อมูลซ้ำ (ชื่อและ/หรืออีเมล) ภายในไฟล์ CSV ก่อนเริ่มทำงาน ---
        const seenEmails = new Set();
        const seenNames = new Set();
        for (const row of results) {
            const email = row.AdminEmail;
            const name = row.AdminName;

            // ตรวจสอบว่าชื่อหรืออีเมลเคยถูกใช้ไปแล้วหรือยัง
            const isEmailDuplicate = email && validator.isEmail(email) && seenEmails.has(email);
            const isNameDuplicate = name && seenNames.has(name);

            if (isEmailDuplicate && isNameDuplicate) {
                throw new Error(`Duplicate entry (both name and email) found in CSV file: Name '${name}', Email '${email}'`);
            } else if (isEmailDuplicate) {
                throw new Error(`Duplicate email found in CSV file: ${email}`);
            } else if (isNameDuplicate) {
                throw new Error(`Duplicate name found in CSV file: ${name}`);
            }

            // ถ้าไม่ซ้ำ ให้เพิ่มเข้าไปใน Set เพื่อตรวจสอบในรอบถัดไป
            if (email && validator.isEmail(email)) seenEmails.add(email);
            if (name) seenNames.add(name);
        }

        // 1. สร้าง Map ของผู้ใช้จากไฟล์ CSV เพื่อให้ค้นหาด้วยอีเมลได้เร็ว
        for (const row of results) {
            if (row.AdminEmail && validator.isEmail(row.AdminEmail)) {
                csvUserMap.set(row.AdminEmail, row);
            }
        }

        // 2. ดึงผู้ใช้ทั้งหมดที่อยู่ภายใต้การดูแลของผู้อัปโหลด
        const [dbUserRows] = await connection.query(
            'SELECT AdminUserID, AdminName, AdminEmail FROM AdminUsers WHERE ParentAdminID = ? FOR UPDATE',
            [uploaderId]
        );

        // 3. (ใหม่) จัดการการลบข้อมูลตามเงื่อนไข
        const usersToDelete = dbUserRows.filter(dbUser => !csvUserMap.has(dbUser.AdminEmail));
        if (usersToDelete.length > 0) {
            const candidateIdsToDelete = usersToDelete.map(user => user.AdminUserID);

            // 3.1. ตรวจสอบว่า ID ที่จะลบ ถูกอ้างอิงในตารางอื่นหรือไม่
            const [referencedInOfficers] = await connection.query(
                'SELECT DISTINCT AdminUserID FROM Officers WHERE AdminUserID IN (?)', [candidateIdsToDelete]
            );
            const [referencedInOrgs] = await connection.query(
                'SELECT DISTINCT AdminUserID FROM Organizations WHERE AdminUserID IN (?)', [candidateIdsToDelete]
            );
            const [referencedInAdmins] = await connection.query(
                'SELECT DISTINCT ParentAdminID FROM AdminUsers WHERE ParentAdminID IN (?)', [candidateIdsToDelete]
            );

            const nonDeletableIds = new Set([
                ...referencedInOfficers.map(r => r.AdminUserID),
                ...referencedInOrgs.map(r => r.AdminUserID),
                ...referencedInAdmins.map(r => r.ParentAdminID)
            ]);

            // 3.2. คัดกรองเฉพาะ ID ที่สามารถลบได้จริงๆ (ไม่อยู่ใน Set ของ ID ที่ถูกอ้างอิง)
            const finalIdsToDelete = candidateIdsToDelete.filter(id => !nonDeletableIds.has(id));

            // 3.3. ทำการลบ
            if (finalIdsToDelete.length > 0) {
                const { affectedRows } = await connection.query(
                    'DELETE FROM AdminUsers WHERE AdminUserID IN (?)', [finalIdsToDelete]
                );
                summary.deleted = affectedRows;
            }

            // 3.4. นับจำนวนผู้ใช้ที่ข้ามการลบไปเพราะติดเงื่อนไข
            summary.skipped_deletion = candidateIdsToDelete.length - finalIdsToDelete.length;
        }

        // 4. วนลูปข้อมูลจาก CSV เพื่อตัดสินใจว่าจะ INSERT หรือ UPDATE
        const dbUserMap = new Map(dbUserRows.map(user => [user.AdminEmail, user]));
        for (const [csvEmail, csvUser] of csvUserMap.entries()) {
            const dbUser = dbUserMap.get(csvEmail);

            if (dbUser) {
                // --- กรณี UPDATE ---
                // ถ้าอีเมลมีอยู่แล้วใน DB, ให้ตรวจสอบว่าชื่อมีการเปลี่ยนแปลงหรือไม่
                const newName = csvUser.AdminName;
                if (dbUser.AdminName !== newName) {
                    // ก่อนอัปเดต, ตรวจสอบว่าชื่อใหม่นี้ไปซ้ำกับคนอื่นหรือไม่
                    const [existingName] = await connection.query(
                        'SELECT AdminUserID FROM AdminUsers WHERE AdminName = ? AND AdminUserID != ?',
                        [newName, dbUser.AdminUserID]
                    );

                    if (existingName.length > 0) {
                        throw new Error(`Cannot update user with email '${csvEmail}'. The name '${newName}' is already in use by another user.`);
                    }

                    // ถ้าชื่อไม่ซ้ำ ให้อัปเดต
                    await connection.query(
                        'UPDATE AdminUsers SET AdminName = ? WHERE AdminUserID = ?',
                        [newName, dbUser.AdminUserID]
                    );
                    summary.updated++;
                } else {
                    // ถ้าข้อมูลเหมือนเดิมทุกอย่าง
                    summary.unchanged++;
                }
            } else {
                // --- กรณี INSERT ---
                // ถ้าอีเมลยังไม่มีใน DB ให้เพิ่มเป็นผู้ใช้ใหม่
                const { AdminName } = csvUser;
                // ตรวจสอบข้อมูลที่จำเป็นก่อนเพิ่ม
                if (!AdminName) {
                    throw new Error(`Missing required field (AdminName) for new user with email: ${csvEmail}`);
                }

                // ก่อน INSERT, ตรวจสอบว่าชื่อใหม่นี้ไปซ้ำกับคนอื่นหรือไม่
                const [existingName] = await connection.query(
                    'SELECT AdminUserID FROM AdminUsers WHERE AdminName = ?',
                    [AdminName]
                );

                if (existingName.length > 0) {
                    // ถ้าชื่อซ้ำกับคนอื่น ให้ข้ามไป (ตามคำขอ)
                    summary.unchanged++; // นับเป็น unchanged เพื่อความสอดคล้อง
                } else {
                    // ถ้าชื่อไม่ซ้ำ ให้ทำการเพิ่มผู้ใช้ใหม่
                    // สุ่มรหัสผ่านใหม่สำหรับผู้ใช้
                    const randomPassword = Math.random().toString(36).slice(-8); // สร้างรหัสผ่านสุ่ม 8 ตัวอักษร

                    await connection.query(
                        'INSERT INTO AdminUsers (AdminName, AdminEmail, AdminPassword, ParentAdminID) VALUES (?, ?, ?, ?)',
                        [csvUser.AdminName, csvEmail, randomPassword, uploaderId]
                    );
                    summary.inserted++;
                }
            }
        }

        await connection.commit();

        // --- (ย้ายมาทำหลังสุด) จัดการไฟล์หลังจากประมวลผลสำเร็จ ---
        try {
            const userSpecificDir = path.join(__dirname, '..', '..', 'files', 'manageadminusers', uploaderId.toString());
            const originalFileName = req.file.originalname;
            const newFilePath = path.join(userSpecificDir, originalFileName);

            // 1. สร้างโฟลเดอร์ถ้ายังไม่มี
            await fs.promises.mkdir(userSpecificDir, { recursive: true });

            // 2. ลบไฟล์เก่าทั้งหมดในไดเรกทอรีของผู้ใช้
            const existingFiles = await fs.promises.readdir(userSpecificDir);
            for (const file of existingFiles) {
                await fs.promises.unlink(path.join(userSpecificDir, file));
                console.log(`🧹 Deleted old file: ${file} for user ${uploaderId}`);
            }

            // 3. ย้ายไฟล์ใหม่จากตำแหน่งชั่วคราวไปยังตำแหน่งถาวร
            await fs.promises.rename(filePath, newFilePath);
        } catch (fileError) {
            console.error('⚠️ Error managing stored file after successful DB operation:', fileError);
        }

        res.status(200).json({
            success: true,
            message: 'Users synchronized successfully.',
            summary
        });

    } catch (error) {
        if (connection) await connection.rollback();
        // คำนวณ failed ให้ถูกต้อง
        summary.failed = csvUserMap.size - (summary.inserted + summary.updated + summary.unchanged);

        if (error.message.startsWith('Missing required field') || error.message.startsWith('Cannot update user') || error.message.startsWith('Cannot insert user') || error.message.startsWith('Duplicate')) {
             res.status(400).json({ success: false, message: error.message, summary });
        } else {
            console.error('❌ Error processing CSV upload:', error);
            res.status(500).json({ success: false, message: 'An internal server error occurred.', summary });
        }
    } finally {
        if (connection) connection.release();
        // ลบไฟล์ชั่วคราวถ้ายังคงมีอยู่ (ในกรณีที่ย้ายไฟล์ไม่สำเร็จ)
        try {
            await fs.promises.access(filePath);
            await fs.promises.unlink(filePath);
        } catch (e) { /* File was already moved or does not exist, do nothing */ }
    }
};

module.exports = uploadAdminUsersService;