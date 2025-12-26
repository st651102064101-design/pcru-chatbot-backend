const { pool } = require('../config');
(async () => {
  try {
    const [rows] = await pool.execute('CALL sp_check_email_exists(?)', ['kriangkrai2018@gmail.com']);
    console.log('rows:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('sp error:', err);
    process.exit(1);
  }
})();