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
    try {
        await pool.execute(
            'CALL sp_set_password_reset_token(?, ?, ?)',
            [resetToken, expires, email]
        );
    } catch (spErr) {
        // ถ้า Stored Procedure ไม่มี (เช่น deployment บน DB ที่ไม่ได้ติดตั้ง SP)
        // ให้ใช้ fallback โดยอัปเดตตาราง `AdminUsers` หรือ `Officers` โดยตรง
        if (spErr && (spErr.code === 'ER_SP_DOES_NOT_EXIST' || /sp_set_password_reset_token/.test(String(spErr.message || '')))) {
            try {
                const [adminRes] = await pool.execute(
                    'UPDATE AdminUsers SET reset_token = ?, reset_token_expires = ? WHERE AdminEmail = ?',
                    [resetToken, expires, email]
                );
                // ถ้าไม่มีแถวที่ถูกอัปเดต ให้ลองอัปเดตในตาราง Officers
                if (!adminRes || adminRes.affectedRows === 0) {
                    await pool.execute(
                        'UPDATE Officers SET reset_token = ?, reset_token_expires = ? WHERE Email = ?',
                        [resetToken, expires, email]
                    );
                }
            } catch (updateErr) {
                console.error('❌ Fallback token update failed:', updateErr);
                // don't rethrow here; we want to continue and try sending email/logging
            }
        } else {
            throw spErr; // rethrow unexpected errors
        }
    }

    const resetLink = `${config.CLIENT_URL}?token=${resetToken}&email=${email}`;
 
    // ...existing code...
    try {
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
    } catch (mailError) {
        console.error('❌ Failed to send password reset email:', mailError && mailError.message ? mailError.message : mailError);
        console.error('❌ Continuing without throwing so that user receives success response.');
    }
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
            let results;
            try {
                const execRes = await pool.execute('CALL sp_check_email_exists(?)', [email]);
                results = execRes[0];
            } catch (spErr) {
                // ถ้า SP ไม่มี ให้ fallback ไปค้นหาในตารางโดยตรง
                if (spErr && (spErr.code === 'ER_SP_DOES_NOT_EXIST' || /sp_check_email_exists/.test(String(spErr.message || '')))) {
                    // ค้นหาใน AdminUsers
                    const [adminRows] = await pool.execute(
                        'SELECT AdminUserID AS user_id, AdminEmail AS email_addr FROM AdminUsers WHERE AdminEmail = ? LIMIT 1',
                        [email]
                    );
                    if (adminRows && adminRows.length > 0) {
                        results = [[{ email_status: 'Found', user_id: adminRows[0].user_id }]];
                    } else {
                        const [offRows] = await pool.execute(
                            'SELECT OfficerID AS user_id, Email AS email_addr FROM Officers WHERE Email = ? LIMIT 1',
                            [email]
                        );
                        if (offRows && offRows.length > 0) {
                            results = [[{ email_status: 'Found', user_id: offRows[0].user_id }]];
                        } else {
                            results = [[]];
                        }
                    }
                } else {
                    throw spErr;
                }
            }

            const resultData = results && results[0] && results[0][0];
            const emailStatus = resultData ? resultData.email_status : 'Not Found';
            const userId = resultData ? resultData.user_id : null;

            const emailExists = emailStatus === 'Found';

            if (emailExists && userId) {
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
                message: 'Internal Server Error occurred',
                error: error.message || String(error),
                stack: error.stack
            });
        }
    };
};

module.exports = forgotPasswordService;