#!/usr/bin/env node
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

async function cleanup() {
  const root = path.join(__dirname, '..', 'files', 'managecategories');
  if (!fsSync.existsSync(root)) {
    console.log('No managecategories folder, nothing to do');
    return;
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const uploaderDir = path.join(root, dirent.name);
    const files = await fs.readdir(uploaderDir);
    for (const f of files) {
      if (f === 'categories_export_latest.csv') continue;
      const p = path.join(uploaderDir, f);
      try {
        const st = await fs.stat(p);
        if (st.isFile()) {
          await fs.unlink(p);
          console.log(`Removed ${p}`);
        }
      } catch (err) {
        console.error(`Failed to remove ${p}:`, err && err.message);
      }
    }
  }
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err && err.stack || err);
  process.exit(1);
});
