require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    const [rows] = await pool.execute('CALL sp_check_email_exists(?)', ['kriangkrai2018@gmail.com']);
    console.log('rows:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('sp error:', err);
    process.exit(1);
  }
})();