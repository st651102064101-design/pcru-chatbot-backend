// services/validateResetToken.js

/**
 * Service to validate a password reset token.
 * It checks if the token and email combination exists and if the token has not expired.
 *
 * @param {import('mysql2/promise').Pool} pool - MySQL Connection Pool
 * @returns {function} - Express Middleware (req, res)
 */
const validateResetTokenService = (pool) => {
    return async (req, res) => {
        const { token, email } = req.body;

        if (!token || !email) {
            return res.status(400).json({
                success: false,
                message: 'Token and email are required.'
            });
        }

        try {
            // ค้นหาในตาราง AdminUsers ก่อน
            let [users] = await pool.execute(
                'SELECT reset_token_expires FROM AdminUsers WHERE AdminEmail = ? AND reset_token = ?',
                [email, token]
            );

            // ถ้าไม่พบ ให้ค้นหาในตาราง Officers ต่อ
            if (users.length === 0) {
                [users] = await pool.execute(
                    'SELECT reset_token_expires FROM Officers WHERE Email = ? AND reset_token = ?',
                    [email, token]
                );
            }

            // ตรวจสอบผลลัพธ์
            if (users.length === 0) {
                // ไม่พบ Token หรือ Email ที่ตรงกัน
                return res.status(400).json({ success: false, message: 'Invalid token or email.' });
            }

            const user = users[0];
            // ตรวจสอบว่า Token หมดอายุหรือไม่
            if (new Date(user.reset_token_expires) < new Date()) {
                return res.status(400).json({ success: false, message: 'Token has expired.' });
            }

            // ถ้าทุกอย่างถูกต้อง
            return res.status(200).json({ success: true, message: 'Token is valid.' });

        } catch (error) {
            console.error('❌ Error during token validation:', error);
            return res.status(500).json({
                success: false,
                message: 'An internal server error occurred.'
            });
        }
    };
};

module.exports = validateResetTokenService;