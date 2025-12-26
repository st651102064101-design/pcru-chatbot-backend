const express = require('express');
const router = express.Router();

/**
 * GET /system/info
 * ดึงข้อมูลเกี่ยวกับระบบ เช่น จำนวนคำถาม keywords หมวดหมู่ uptime ฯลฯ
 */
module.exports = function(pool) {
  router.get('/info', async (req, res) => {
    try {
      // Query ข้อมูลสถิติจากฐานข้อมูล
      const [questions] = await pool.query('SELECT COUNT(*) as count FROM QuestionsAnswers');
      const [keywords] = await pool.query('SELECT COUNT(*) as count FROM Keywords');
      const [categories] = await pool.query('SELECT COUNT(*) as count FROM Categories');
      const [organizations] = await pool.query('SELECT COUNT(*) as count FROM Organizations');
      const [officers] = await pool.query('SELECT COUNT(*) as count FROM Officers');
      const [feedbacks] = await pool.query('SELECT COUNT(*) as count FROM Feedbacks');
      const [synonyms] = await pool.query('SELECT COUNT(*) as count FROM KeywordSynonyms');

      // คำนวณ uptime (server uptime)
      const uptimeSeconds = process.uptime();
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const uptimeString = `${days}d ${hours}h ${minutes}m`;

      return res.json({
        ok: true,
        data: {
          totalQuestions: questions[0].count.toLocaleString(),
          totalKeywords: keywords[0].count.toLocaleString(),
          totalCategories: categories[0].count.toLocaleString(),
          totalOrganizations: organizations[0].count.toLocaleString(),
          totalOfficers: officers[0].count.toLocaleString(),
          totalFeedbacks: feedbacks[0].count.toLocaleString(),
          totalSynonyms: synonyms[0].count.toLocaleString(),
          uptime: uptimeString,
          serverTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: {
            rss: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) + ' MB',
            heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
          }
        }
      });
    } catch (error) {
      console.error('System info error:', error);
      return res.status(500).json({ 
        ok: false, 
        message: 'Failed to fetch system information',
        error: error.message 
      });
    }
  });

  /**
   * GET /system/timeout-config
   * ดึงข้อมูลการตั้งค่า timeout สำหรับ frontend
   * (public endpoint - ไม่ต้อง authenticate)
   */
  router.get('/timeout-config', (req, res) => {
    try {
      const config = {
        sessionTimeout: process.env.SESSION_TIMEOUT || '24h',
        idleTimeout: process.env.IDLE_TIMEOUT || '15m'
      };
      
      return res.json({
        ok: true,
        config: config
      });
    } catch (error) {
      console.error('Timeout config error:', error);
      return res.status(500).json({
        ok: false,
        message: 'Failed to fetch timeout configuration',
        error: error.message
      });
    }
  });

  return router;
};
