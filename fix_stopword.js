const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  
  console.log('Getting Stopwords table structure...');
  const [cols] = await pool.query('SHOW COLUMNS FROM Stopwords');
  console.log('Columns:', cols.map(c => c.Field));
  
  console.log('\nDeleting ไม่เอา from Stopwords...');
  const [result] = await pool.query("DELETE FROM Stopwords WHERE StopwordText = ?", ['ไม่เอา']);
  console.log('✅ Deleted from Stopwords:', result.affectedRows, 'rows');
  
  console.log('\nChecking NegativeKeywords...');
  const [rows] = await pool.query("SELECT * FROM NegativeKeywords WHERE Word = ?", ['ไม่เอา']);
  console.log('NegativeKeywords found:', rows.length);
  if (rows.length > 0) {
    console.log('Details:', rows[0]);
  }
  
  await pool.end();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
