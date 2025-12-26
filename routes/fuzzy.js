const express = require('express');
const { similarity, findClosestMatch, findAllMatches } = require('../utils/fuzzyMatch');

module.exports = function(pool) {
  const router = express.Router();

  /**
   * POST /fuzzy/test
   * ทดสอบ fuzzy matching ระหว่างคำ input กับคำใน database
   * Body: { input: "หอพก", threshold: 0.75 }
   */
  router.post('/test', async (req, res) => {
  try {
    const { input, threshold = 0.75 } = req.body;
    
    if (!input) {
      return res.status(400).json({ ok: false, message: 'Missing input' });
    }

    // ดึงคำทั้งหมดจาก keywords table
    const [keywords] = await pool.query(
      'SELECT DISTINCT keyword FROM keywords WHERE keyword IS NOT NULL AND keyword != ""'
    );

    const candidates = keywords.map(row => row.keyword);
    
    // หา matches
    const matches = findAllMatches(input, candidates, threshold);
    
    return res.json({
      ok: true,
      input,
      threshold,
      totalCandidates: candidates.length,
      matches: matches.slice(0, 10) // ส่งกลับ top 10
    });
  } catch (error) {
    console.error('Fuzzy test error:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * POST /fuzzy/similarity
 * คำนวณความคล้ายระหว่างสองคำ
 * Body: { str1: "หอพัก", str2: "หอพก" }
 */
router.post('/similarity', (req, res) => {
  try {
    const { str1, str2 } = req.body;
    
    if (!str1 || !str2) {
      return res.status(400).json({ ok: false, message: 'Missing str1 or str2' });
    }

    const score = similarity(str1, str2);
    
    return res.json({
      ok: true,
      str1,
      str2,
      similarity: score,
      percentage: (score * 100).toFixed(2) + '%'
    });
  } catch (error) {
    console.error('Similarity calculation error:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

  return router;
};
