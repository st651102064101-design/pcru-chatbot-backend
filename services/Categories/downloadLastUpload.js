// services/Categories/downloadLastUpload.js
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

/**
 * Service to download the last uploaded CSV file for the logged-in user (categories uploads).
 * @returns {function} - Express Middleware (req, res).
 */
const downloadLastUploadService = () => async (req, res) => {
    try {
        const uploaderId = req.user?.userId;
        if (!uploaderId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }

        // Use per-uploader directory
        const userDirectory = path.join(__dirname, '..', '..', 'files', 'managecategories', String(uploaderId));

        // Ensure we have a DB pool available (try req.pool then app.locals.pool)
        const pool = req.pool || (req.app && req.app.locals && req.app.locals.pool) || null;
        console.log('/categories/last-upload called by user', uploaderId, 'poolPresent=', !!pool, 'userDirectory=', userDirectory);


        // First try to regenerate categories CSV from DB (always export fresh canonical file)
        try {
            const writeCategoriesCSV = require('./writeCategoriesCSV');
            console.log('Invoking writeCategoriesCSV for /categories/last-upload, poolPresent=', !!pool, 'uploader=', uploaderId);
            const { latestPath } = await writeCategoriesCSV(pool, uploaderId)();
            console.log(`⬅️ /categories/last-upload: regenerated CSV at ${latestPath}`);

            // Use regenerated file as filePath
            const filePath = latestPath;

            // Read and modify CSV to ensure CategoriesID is treated as text for Excel
            try {
                const csvContent = await fs.readFile(filePath, 'utf-8');
                const lines = csvContent.split('\n');

                const normalizedLines = lines.map((line, idx) => {
                    if (!line || line.trim().length === 0) return line;
                    if (idx === 0) return line; // header
                    const cells = line.split(',');
                    return cells.map(cell => {
                        const trimmed = cell.trim();
                        if (/^\d{1,2}-\d{1,2}$/.test(trimmed)) {
                            return `=\"${trimmed}\"`;
                        }
                        return cell;
                    }).join(',');
                });

                const BOM = '\uFEFF';
                const cleanedContent = BOM + normalizedLines.join('\n');
                const tempFilePath = path.join(userDirectory, `temp_${Date.now()}_categories.csv`);
                await fs.writeFile(tempFilePath, cleanedContent, 'utf-8');
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="categories_export_latest.csv"`);
                res.setHeader('Cache-Control', 'no-store');
                res.download(tempFilePath, 'categories_export_latest.csv', async (err) => {
                    try { await fs.unlink(tempFilePath); } catch(e){}
                    if (err) console.error('❌ Error sending cleaned categories CSV:', err);
                });
                return;

            } catch (modifyError) {
                console.error('⚠️ Error modifying regenerated categories CSV, sending original:', modifyError);
                return res.download(filePath, path.basename(filePath), (err) => {
                    if (err) console.error('❌ Error sending regenerated file to client:', err);
                });
            }

        } catch (regenErr) {
            console.error('❌ Failed to regenerate categories CSV:', regenErr && (regenErr.stack || regenErr.message || regenErr));
            // Fallback to existing files in userDirectory
        }

        // If we reach here, regeneration failed — fallback to previous behavior
        // If the userDirectory does not exist, respond 404
        if (!fsSync.existsSync(userDirectory)) {
            return res.status(404).json({ success: false, message: 'No previously uploaded file found.' });
        }

        const files = await fs.readdir(userDirectory);

        if (files.length === 0) {
            return res.status(404).json({ success: false, message: 'No previously uploaded file found.' });
        }

        // Find the most recently modified file
        const latestFile = await files.reduce(async (latest, current) => {
            const latestPath = path.join(userDirectory, await latest);
            const currentPath = path.join(userDirectory, current);
            const latestStat = await fs.stat(latestPath);
            const currentStat = await fs.stat(currentPath);
            return currentStat.mtime > latestStat.mtime ? current : await latest;
        }, Promise.resolve(files[0]));

        const filePath = path.join(userDirectory, latestFile);

        // Read and modify CSV to remove Excel text format
        try {
            const csvContent = await fs.readFile(filePath, 'utf-8');
            const lines = csvContent.split('\n');

            // Normalize: ensure text format for CategoriesID-like values to prevent Excel date conversion
            // - Header stays intact
            // - Cells matching digit-digit pattern become ="x-y" to force text
            const normalizedLines = lines.map((line, idx) => {
                if (line.trim().length === 0) return line;
                // Split by commas while respecting quotes
                const cells = line.split(',');
                // Find header index for CategoriesID on first line
                if (idx === 0) {
                    return line; // header untouched
                }
                return cells
                  .map((cell, colIdx) => {
                      const trimmed = cell.trim();
                      // If this cell appears in CategoriesID column (we can't be sure of index without parse)
                      // Apply safe transform: any plain token that matches d-d becomes ="d-d"
                      // But don't alter already quoted values
                      if (/^\d{1,2}-\d{1,2}$/.test(trimmed)) {
                          return `=\"${trimmed}\"`;
                      }
                      return cell;
                  })
                  .join(',');
            });

            // Add UTF-8 BOM for Excel
            const BOM = '\uFEFF';
            const cleanedContent = BOM + normalizedLines.join('\n');
            
            // Create temporary cleaned file
            const tempFilePath = path.join(userDirectory, `temp_${Date.now()}_${latestFile}`);
            await fs.writeFile(tempFilePath, cleanedContent, 'utf-8');
            
            // Send the cleaned file
            res.download(tempFilePath, latestFile, async (err) => {
                // Clean up temp file after sending
                try {
                    await fs.unlink(tempFilePath);
                } catch (cleanupErr) {
                    console.error('⚠️ Failed to cleanup temp file:', cleanupErr);
                }
                
                if (err) {
                    console.error('❌ Error sending file to client:', err);
                }
            });
            
        } catch (modifyError) {
            console.error('⚠️ Error modifying CSV, sending original:', modifyError);
            // Fallback to original file if modification fails
            res.download(filePath, latestFile, (err) => {
                if (err) {
                    console.error('❌ Error sending file to client:', err);
                }
            });
        }

    } catch (error) {
        console.error('❌ Error retrieving last uploaded file:', error);
        res.status(500).json({ success: false, message: 'An internal server error occurred while retrieving the file.' });
    }
};

module.exports = downloadLastUploadService;