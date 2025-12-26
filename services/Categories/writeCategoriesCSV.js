const fs = require('fs').promises;
const path = require('path');

/**
 * Export current Categories to CSV and save under files/managecategories/
 * Returns the written file path.
 */
const writeCategoriesCSV = (pool, uploaderId = 1001) => async () => {
  if (!pool) throw new Error('Database pool required');
  if (!uploaderId) uploaderId = 1001;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Write per-uploader so downloads come from user's folder
  const baseDir = path.join(__dirname, '..', '..', 'files', 'managecategories', String(uploaderId));
  const filenameLatest = `categories_export_latest.csv`;
  const tmpFilename = `categories_export_${timestamp}.tmp`;
  const tmpPath = path.join(baseDir, tmpFilename);
  const latestPath = path.join(baseDir, filenameLatest);

  await fs.mkdir(baseDir, { recursive: true });

  // Determine which columns exist in Categories table and build select list
  const [colInfo] = await pool.query(`
    SELECT COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Categories'
  `, [process.env.DB_NAME || 'pcru_auto_response']);
  const availableCols = new Set(colInfo.map(r => r.COLUMN_NAME));

  const wantedCols = ['CategoriesID', 'CategoriesName', 'CategoriesDetail', 'ParentCategoriesID', 'CategoriesPDF'];
  const selectedCols = wantedCols.filter(c => availableCols.has(c));
  if (selectedCols.length === 0) throw new Error('No category columns available for export');

  // If CategoriesID is selected, export the category NAME instead of the numeric ID
  // and avoid duplicating the CategoriesName column if it's already present.
  const finalCols = selectedCols.slice();
  const idIdx = finalCols.indexOf('CategoriesID');
  if (idIdx !== -1) {
    if (finalCols.includes('CategoriesName')) {
      // Remove the ID column if name column is already present
      finalCols.splice(idIdx, 1);
    } else {
      // Replace ID column header with CategoriesName so values show the name
      finalCols[idIdx] = 'CategoriesName';
    }
  }

  const selectSql = `SELECT ${selectedCols.join(', ')} FROM Categories ORDER BY CategoriesID ASC`;
  const [rows] = await pool.query(selectSql);

  const headers = finalCols;
  const lines = [headers.join(',')];
  rows.forEach((r) => {
    // Map values according to finalCols. If finalCols contains 'CategoriesName' it will use the name.
    const cols = finalCols.map(c => escapeCsv(String(r[c] || '')));
    lines.push(cols.join(','));
  });

  // Add UTF-8 BOM so Excel detects UTF-8 with Thai characters
  const csvContent = '\uFEFF' + (lines.join('\n') + '\n');

  console.log(`🔁 writeCategoriesCSV: starting write, tmp=${tmpPath}`);
  try {
    await fs.writeFile(tmpPath, csvContent, 'utf8');
    await fs.rename(tmpPath, latestPath);
    console.log(`✅ writeCategoriesCSV: wrote latestPath=${latestPath}`);

    // No stable duplicate file: keep only the canonical latest CSV to avoid confusion
    // (previously copied to last_uploaded_categories.csv; removed to ensure single file per uploader)
  } catch (err) {
    console.error('❌ writeCategoriesCSV: failed to write/rename file', err && (err.message || err));
    throw err;
  }

  // Cleanup: remove any files except latest and stable
  try {
    const files = await fs.readdir(baseDir);
    for (const f of files) {
      if (f === filenameLatest) continue;
      try {
        const p = path.join(baseDir, f);
        const st = await fs.stat(p);
        if (st.isFile()) {
          await fs.unlink(p);
          console.log(`🧹 writeCategoriesCSV: removed old file ${p}`);
        }
      } catch (err) {
        console.error('Failed to remove non-latest file in categories dir', f, err && err.message);
      }
    }
  } catch (err) {
    console.error('Error cleaning up categories export files:', err && err.message);
  }

  return { latestPath };
};

function escapeCsv(value) {
  if (value == null) return '';
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

module.exports = writeCategoriesCSV;
