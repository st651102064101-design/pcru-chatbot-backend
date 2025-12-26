console.log('Starting test download service');
const downloadService = require('../services/Categories/downloadLastUpload')();
console.log('downloadService loaded');
const mysql = require('mysql2/promise');

(async () => {
  const pool = require('../server').locals ? require('../server').locals.pool : null;
  // Fallback: create a short-lived pool
  const testPool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });

  const req = {
    user: { userId: 3001, OfficerID: 1 },
    pool: testPool,
    app: { locals: { pool: testPool } }
  };

  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    download(filePath, filename, cb) {
      console.log('download called with', filePath, filename);
      // Read small portion and print first 200 chars
      require('fs').promises.readFile(filePath, 'utf8').then(content => {
        console.log('file size', content.length);
        console.log('head:', content.slice(0,200));
        if (cb) cb();
      }).catch(err => { console.error('read failed', err); if (cb) cb(err); });
    },
    status(code) { this._status = code; return this; },
    json(obj) { console.log('json response', this._status, obj); }
  };

  try {
    await downloadService(req, res);
    await testPool.end();
    process.exit(0);
  } catch (err) {
    console.error('downloadService threw', err && (err.stack || err.message));
    await testPool.end();
    process.exit(1);
  }
})();
