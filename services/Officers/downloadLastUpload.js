const path = require('path');
const fs = require('fs').promises;
const writeOfficersCSV = require('./writeOfficersCSV');

/**
 * Service to download the latest CSV (regenerated from DB) for officers.
 * Always regenerates CSV from current DB state and sends it to the client.
 * @returns {function} - Express Middleware (req, res).
 */
const downloadLastUploadService = () => async (req, res) => {
    try {
        const uploaderId = req.user?.userId;
        if (!uploaderId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }

        const targetId = Number(uploaderId) === 1001 ? 1001 : uploaderId;
        console.log(`➡️ /officers/last-upload requested by user ${uploaderId} — regenerating CSV for targetId=${targetId}`);
        let latestPath;
        try {
            const result = await writeOfficersCSV(req.pool, targetId)();
            latestPath = result && result.latestPath;
            console.log(`⬅️ /officers/last-upload: regenerated CSV at ${latestPath}`);
        } catch (err) {
            console.error('❌ writeOfficersCSV during /officers/last-upload failed:', err && (err.stack || err.message || err));
            // Retry with fresh pool once
            try {
                const mysql = require('mysql2/promise');
                const tmpPool = await mysql.createPool({ host: process.env.DB_HOST, user: process.env.DB_USER || 'root', database: process.env.DB_NAME || 'pcru_auto_response', waitForConnections: true, connectionLimit: 2 });
                const result = await writeOfficersCSV(tmpPool, targetId)();
                latestPath = result && result.latestPath;
                console.log(`⬅️ /officers/last-upload: regenerated CSV on retry at ${latestPath}`);
                await tmpPool.end();
            } catch (retryErr) {
                console.error('❌ Retry writeOfficersCSV during /officers/last-upload failed:', retryErr && (retryErr.stack || retryErr.message || retryErr));
                latestPath = null;
            }
        }

        if (latestPath) {
            const filename = path.basename(latestPath);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.download(latestPath, filename, (err) => {
                if (err) {
                    console.error('❌ Error sending regenerated officers CSV to client:', err && err.message);
                }
            });
            return;
        }

        // Fallback: try to send the stable last_uploaded_officers.csv in user's dir if exists
        try {
            const userDirectory = path.join(__dirname, '..', '..', 'files', 'manageofficers', String(req.user?.userId || ''));
            const stablePath = path.join(userDirectory, 'last_uploaded_officers.csv');
            try {
                await fs.access(stablePath);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                res.download(stablePath, 'officers_export_latest.csv', (err) => {
                    if (err) console.error('❌ Error sending stable officers file to client:', err && err.message);
                });
                return;
            } catch (noStable) {
                // No stable file; try any file in directory
                await fs.access(userDirectory);
                const files = await fs.readdir(userDirectory);
                if (files.length === 0) return res.status(404).json({ success: false, message: 'No previously uploaded file found.' });
                const latestFile = await files.reduce(async (latest, current) => {
                    const latestPath = path.join(userDirectory, await latest);
                    const currentPath = path.join(userDirectory, current);
                    const latestStat = await fs.stat(latestPath);
                    const currentStat = await fs.stat(currentPath);
                    return currentStat.mtime > latestStat.mtime ? current : await latest;
                }, Promise.resolve(files[0]));
                const filePath = path.join(userDirectory, latestFile);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Cache-Control', 'no-store');
                res.download(filePath, latestFile, (err) => {
                    if (err) console.error('❌ Error sending fallback officers file to client:', err && err.message);
                });
                return;
            }
        } catch (fallbackErr) {
            console.error('❌ Fallback also failed:', fallbackErr && (fallbackErr.stack || fallbackErr.message || fallbackErr));
            res.status(500).json({ success: false, message: 'An internal server error occurred while retrieving the file.' });
            return;
        }

    } catch (error) {
        console.error('❌ Error retrieving last uploaded officers file (regeneration):', error && (error.message || error));
        // Fallback: send user's uploaded file if exists
        try {
            const userDirectory = path.join(__dirname, '..', '..', 'files', 'manageofficers', String(req.user?.userId || ''));
            await fs.access(userDirectory);
            const files = await fs.readdir(userDirectory);
            if (files.length === 0) {
                return res.status(404).json({ success: false, message: 'No previously uploaded file found.' });
            }
            const latestFile = await files.reduce(async (latest, current) => {
                const latestPath = path.join(userDirectory, await latest);
                const currentPath = path.join(userDirectory, current);
                const latestStat = await fs.stat(latestPath);
                const currentStat = await fs.stat(currentPath);
                return currentStat.mtime > latestStat.mtime ? current : await latest;
            }, Promise.resolve(files[0]));
            const filePath = path.join(userDirectory, latestFile);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.download(filePath, latestFile, (err) => {
                if (err) console.error('❌ Error sending fallback officers file to client:', err && err.message);
            });
        } catch (fallbackErr) {
            console.error('❌ Fallback also failed:', fallbackErr && fallbackErr.message);
            res.status(500).json({ success: false, message: 'An internal server error occurred while retrieving the file.' });
        }
    }
};

module.exports = downloadLastUploadService;