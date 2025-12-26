const fs = require('fs').promises;
const path = require('path');

/**
 * Export current AdminUsers to CSV and save under files/manageadminusers/<uploaderId>/
 * Returns the written file path.
 */
const writeAdminUsersCSV = (pool, uploaderId = 1) => async () => {
  if (!pool) throw new Error('Database pool required');
  if (!uploaderId) uploaderId = 1;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseDir = path.join(__dirname, '..', '..', 'files', 'manageadminusers', String(uploaderId));
  const filename = `adminusers_export_${timestamp}.csv`;
  const filenameLatest = `adminusers_export_latest.csv`;
  const filePath = path.join(baseDir, filename);
  const latestPath = path.join(baseDir, filenameLatest);

  await fs.mkdir(baseDir, { recursive: true });

  // Fetch admin users
  const [rows] = await pool.query(`
    SELECT AdminUserID, AdminName, AdminEmail, ParentAdminID
    FROM AdminUsers ORDER BY AdminUserID ASC
  `);

  // Prepare CSV content
  const headers = ['AdminUserID', 'AdminName', 'AdminEmail', 'ParentAdminID'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const cols = [r.AdminUserID, escapeCsv(String(r.AdminName || '')), escapeCsv(String(r.AdminEmail || '')), r.ParentAdminID == null ? '' : r.ParentAdminID];
    lines.push(cols.join(','));
  }

  const csvContent = lines.join('\n') + '\n';

  await fs.writeFile(filePath, csvContent, 'utf8');
  // also write latest copy for quick download by frontend
  await fs.writeFile(latestPath, csvContent, 'utf8');

  return { filePath, latestPath };
};

function escapeCsv(value) {
  if (value == null) return '';
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

module.exports = writeAdminUsersCSV;
