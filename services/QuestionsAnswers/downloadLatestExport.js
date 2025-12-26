// services/QuestionsAnswers/downloadLatestExport.js
// Download the latest auto-exported CSV

const path = require('path');
const fs = require('fs').promises;

/**
 * Download the latest auto-exported CSV
 * This allows admins to download → edit → re-upload
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Pool} pool - MySQL connection pool (not used but kept for consistency)
 */
async function downloadLatestExportService(req, res, pool) {
  try {
    // Get officerId from authenticated user or query params
    const officerId = req.query.officerId || req.user?.officerId || 3001;
    
    // Path to latest CSV
    const exportDir = path.join(__dirname, '../../files/managequestionsanswers', String(officerId));
    const latestPath = path.join(exportDir, 'latest.csv');
    
    // Check if file exists
    try {
      await fs.access(latestPath);
    } catch (err) {
      return res.status(404).json({
        success: false,
        message: 'No exported CSV found. Please upload data first.'
      });
    }
    
    // Get file stats for metadata
    const stats = await fs.stat(latestPath);
    const fileSize = stats.size;
    const lastModified = stats.mtime;
    
    // Set headers for download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="questionsanswers_latest.csv"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Last-Modified', lastModified.toUTCString());
    
    // Stream file to response
    const fileStream = require('fs').createReadStream(latestPath);
    
    fileStream.on('error', (err) => {
      console.error('❌ Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error downloading file'
        });
      }
    });
    
    fileStream.pipe(res);
    
    console.log(`📥 Downloaded latest CSV for Officer ${officerId}`);
    
  } catch (error) {
    console.error('❌ Download latest export failed:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

module.exports = downloadLatestExportService;
