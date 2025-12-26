require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'pcru_auto_response' });
  try {
    const [rows] = await pool.query(
      `SELECT o.OfficerPhone AS phone, o.OfficerName AS officer, org.OrgName AS organization
       FROM Officers o
       LEFT JOIN Organizations org ON o.OrgID = org.OrgID
       WHERE (o.OfficerName LIKE ? OR org.OrgName LIKE ?) AND o.OfficerPhone IS NOT NULL LIMIT 20`,
      ['%วิพาด%', '%ส่งเสริม%']
    );
    console.log('rows found:', rows.length);
    console.log(rows);
  } catch (e) {
    console.error('query failed', e && e.stack || e);
  } finally {
    await pool.end();
  }
})();