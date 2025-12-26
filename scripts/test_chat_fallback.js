const chatService = require('../services/chat/respond')();
const mysql = require('mysql2/promise');
(async () => {
  const pool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
  const req = { body: { message: 'something I have no data about' }, pool, app: { locals: { pool } } };
  const res = {
    _status: 200,
    status(code){ this._status = code; return this; },
    json(obj){ console.log('RESPONSE', JSON.stringify(obj, null, 2)); }
  };
  try {
    await chatService(req, res);
  } catch (e) { console.error('ERROR', e && e.stack || e); }
  await pool.end();
})();