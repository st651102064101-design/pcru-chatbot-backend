const mysql = require('mysql2/promise');
(async () => {
  const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
  const [rows] = await pool.query(`SELECT OrgID, OrgName, OrgPhone FROM Organizations WHERE OrgPhone LIKE '%5671%' OR OrgPhone LIKE '%7119%' LIMIT 20`);
  console.log(rows);
  await pool.end();
})();