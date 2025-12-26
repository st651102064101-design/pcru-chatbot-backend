
/**
 * Service to handle setting a new password using a reset token.
 * It validates the token, email, and new password, then calls a stored procedure
 * to update the password in the database.
 *
 * @param {import('mysql2/promise').Pool} pool - MySQL Connection Pool
 * @returns {function} - Express Middleware (req, res)
 */
const setNewPasswordService = (pool) => {
    return async (req, res) => {
        const { token, email, newPassword } = req.body;

        // 1. ตรวจสอบว่าข้อมูลที่จำเป็นถูกส่งมาครบหรือไม่
        if (!token || !email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token, email, and new password are required.'
            });
        }

        let connection;
        try {
            // --- เริ่มการทำงานแบบไม่ใช้ Stored Procedure ---
            connection = await pool.getConnection();
            await connection.beginTransaction();

            // 2. ค้นหาผู้ใช้ในตาราง AdminUsers ก่อน
            let [adminUsers] = await connection.execute(
                'SELECT AdminUserID, reset_token_expires FROM AdminUsers WHERE AdminEmail = ? AND reset_token = ?',
                [email, token]
            );

            if (adminUsers.length > 0) {
                const user = adminUsers[0];
                // ลบการตรวจสอบวันหมดอายุ: หากพบ token ให้ถือว่าถูกต้องเสมอ
                await connection.execute(
                    'UPDATE AdminUsers SET AdminPassword = ?, reset_token = NULL, reset_token_expires = NULL WHERE AdminUserID = ?',
                    [newPassword, user.AdminUserID]
                );
                await connection.commit();
                console.log(`✅ Password for Admin ${email} has been reset successfully.`);
                return res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
            } else {
                // ไม่พบใน AdminUsers, ค้นหาในตาราง Officers ต่อ
                let [officers] = await connection.execute(
                    'SELECT OfficerID, reset_token_expires FROM Officers WHERE Email = ? AND reset_token = ?',
                    [email, token]
                );

                if (officers.length > 0) {
                    const user = officers[0];
                    // ลบการตรวจสอบวันหมดอายุ: หากพบ token ให้ถือว่าถูกต้องเสมอ
                    await connection.execute(
                        'UPDATE Officers SET OfficerPassword = ?, reset_token = NULL, reset_token_expires = NULL WHERE OfficerID = ?',
                        [newPassword, user.OfficerID]
                    );
                    await connection.commit();
                    console.log(`✅ Password for Officer ${email} has been reset successfully.`);
                    return res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
                }
            }

            // ถ้าไม่พบผู้ใช้ในทั้งสองตาราง
            await connection.commit(); // Commit เพื่อสิ้นสุด transaction
            console.warn(`❌ Failed password reset for ${email}. Reason: Invalid Token`);
            return res.status(400).json({ success: false, message: 'Invalid password reset link.' });

        } catch (error) {
            if (connection) await connection.rollback(); // ย้อนกลับการเปลี่ยนแปลงหากเกิดข้อผิดพลาด
            console.error('❌ Error during password reset process:', error);
            return res.status(500).json({
                success: false,
                message: 'An internal server error occurred.'
            });
        } finally {
            if (connection) connection.release(); // คืน connection กลับสู่ pool
        }
    };
};

module.exports = setNewPasswordService;