const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    waitForConnections: true
  });

  const conn = await pool.getConnection();
  
  // Delete ไม่เอา from Ignored table
  const [result] = await conn.query("DELETE FROM NegativeKeywords_Ignored WHERE Word = 'ไม่เอา'");
  console.log('Deleted from Ignored:', result.affectedRows);
  
  // Verify
  const [check] = await conn.query("SELECT * FROM NegativeKeywords_Ignored WHERE Word = 'ไม่เอา'");
  console.log('Check after delete:', check.length === 0 ? 'DELETED!' : 'Still exists');
  
  conn.release();
  await pool.end();
  process.exit(0);
})();
