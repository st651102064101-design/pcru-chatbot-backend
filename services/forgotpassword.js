// services/forgotpassword.js

// Import Modules
const crypto = require('crypto'); // สำหรับสร้าง Token ที่ปลอดภัย
const config = require('../config'); // <-- Import ค่าคอนฟิกกลาง

/**
 * Function to mask part of an email, e.g., user.name@domain.com -> use*****@domain.com
 * @param {string} email - The full email address
 * @returns {string} The partially masked email
 */
const maskEmail = (email) => {
    if (!email) return '';

    const parts = email.split('@');
    if (parts.length !== 2) return email;

    const localPart = parts[0];
    const domainPart = parts[1];

    const visibleLength = Math.min(3, localPart.length);
    const maskedLocalPart = 
        localPart.substring(0, visibleLength) + 
        '*****';

    return `${maskedLocalPart}@${domainPart}`;
};

/**
 * This function generates a unique token, saves it to the database,
 * and sends an email containing the reset link.
 * * * @param {import('mysql2/promise').Pool} pool - MySQL Connection Pool
 * * @param {import('nodemailer').Transporter} transporter - Nodemailer Transporter instance
 * @param {string} email - The user's full email address
 * @param {string} userId - The user's ID (AdminUserID or OfficerID)
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (pool, transporter, email, userId) => {

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1); // Token หมดอายุใน 1 ชั่วโมง

    // เรียกใช้ Stored Procedure เพื่ออัปเดต reset token สำหรับ AdminUsers หรือ Officers
    await pool.execute(
        'CALL sp_set_password_reset_token(?, ?, ?)',
        [resetToken, expires, email]
    );

    const resetLink = `${config.CLIENT_URL}?token=${resetToken}&email=${email}`;
 
    // ...existing code...
    await transporter.sendMail({
        from: `"PCRU Chatbot Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'คำขอรีเซ็ตรหัสผ่าน / Password Reset Request',
        text: `มีการขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ

                ID: ${userId}

                กรุณาใช้ลิงก์นี้เพื่อตั้งรหัสผ่านใหม่:
                ${resetLink}

                ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ โปรดเพิกเฉยอีเมลฉบับนี้

                ---

                A password reset request has been made for your account.

                ID: ${userId}

                Please use the link below to set a new password:
                ${resetLink}

                This link will expire in 1 hour. If you did not request this, please ignore this email.`,
                        html: `
                            <div style="font-family: sans-serif; line-height:1.4;">
                                <h3>คำขอรีเซ็ตรหัสผ่าน</h3>
                                <p>มีการขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ</p>
                                <p><b>ID บัญชีของคุณคือ: ${userId}</b></p>
                                <p><a href="${resetLink}">คลิกที่นี่เพื่อตั้งรหัสผ่านใหม่</a></p>
                                <p>ลิงก์นี้จะหมดอายุใน 1 ชั่วโมง หากคุณไม่ได้ร้องขอ โปรดเพิกเฉยอีเมลฉบับนี้</p>
                                <hr/>
                                <h3>Password Reset Request</h3>
                                <p>A password reset request has been made for your account.</p>
                                <p><b>Your Account ID is: ${userId}</b></p>
                                <p><a href="${resetLink}">Click here to set a new password</a></p>
                                <p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
                            </div>
                        `,
                    });
                    console.log(`[REAL SEND] Password reset email sent successfully to ${email}`);
    // ...existing code...
};


/**
 * * @param {import('mysql2/promise').Pool} pool - MySQL Connection Pool
 * * @param {import('nodemailer').Transporter} transporter - Nodemailer Transporter instance
 */
const forgotPasswordService = (pool, transporter) => { // <--- รับ transporter เข้ามา
    return async (req, res) => {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide the email address used for password recovery' 
            });
        }

        const maskedEmail = maskEmail(email);

        try {
            const [results] = await pool.execute(
                'CALL sp_check_email_exists(?)',
                [email]
            );

            const resultData = results && results[0] && results[0][0];
            const emailStatus = resultData ? resultData.email_status : 'Not Found';
            // ดึง user_id ที่คืนค่ามาจาก Stored Procedure
            const userId = resultData ? resultData.user_id : null;

            const emailExists = emailStatus === 'Found';

            if (emailExists && userId) {
                // ส่ง userId ไปด้วย
                await sendPasswordResetEmail(pool, transporter, email, userId);
                
            } else {
                console.log(`❌ Attempted password reset for non-existent email: ${email}`);
            }
            return res.status(200).json({ 
                success: true, 
                message: 'Password reset request has been sent. Please check your email',
                maskedEmail: maskedEmail
            });

        } catch (error) {
            console.error('❌ Error during forgot password process:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Internal Server Error occurred' 
            });
        }
    };
};

module.exports = forgotPasswordService;