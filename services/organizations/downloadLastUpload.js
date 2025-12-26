const path = require('path');
const fs = require('fs').promises;

/**
 * Service to download the last uploaded organization file for the logged-in user.
 * @returns {function} - Express Middleware (req, res).
 */
const downloadLastUploadOrganizationsService = () => async (req, res) => {
    try {
        const uploaderId = req.user?.userId;
        if (!uploaderId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }

        const userDirectory = path.join(__dirname, '..', '..', 'files', 'manageorganizations', uploaderId.toString());

        // Check if the directory exists
        try {
            await fs.access(userDirectory);
        } catch (dirError) {
            return res.status(404).json({ success: false, message: 'No previously uploaded organization file found.' });
        }

        const files = await fs.readdir(userDirectory);

        if (files.length === 0) {
            return res.status(404).json({ success: false, message: 'No previously uploaded organization file found.' });
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

        res.download(filePath, latestFile, (err) => {
            if (err) {
                console.error('❌ Error sending organization file to client:', err);
            }
        });

    } catch (error) {
        console.error('❌ Error retrieving last uploaded organization file:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = downloadLastUploadOrganizationsService;
