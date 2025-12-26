/**
 * Admin API for keyword deduplication
 * Allows staff to view and merge similar keywords
 */

const express = require('express');
const router = express.Router();
const { 
  suggestKeywordMerges, 
  mergeKeywords,
  findSubstringRelationship 
} = require('../services/semanticData/deduplicateKeywords');

/**
 * Middleware to pass pool to routes
 */
router.use((req, res, next) => {
  // Get pool from app.locals (set by server.js)
  if (!req.pool && req.app.locals && req.app.locals.pool) {
    req.pool = req.app.locals.pool;
  }
  next();
});

/**
 * GET /admin/keywords/suggest-merges
 * View all keyword merge suggestions
 */
router.get('/keywords/suggest-merges', async (req, res) => {
  try {
    const pool = req.pool;
    if (!pool) {
      return res.status(500).json({ success: false, message: 'Database pool not available' });
    }
    
    const suggestions = await suggestKeywordMerges(pool);
    
    return res.status(200).json({
      success: true,
      count: suggestions.length,
      suggestions: suggestions.map(s => ({
        parent: s.parent,
        parentId: s.parentId,
        child: s.child,
        childId: s.childId,
        sharedQACount: s.sharedQACount,
        action: `POST /admin/keywords/merge with parent=${s.parentId}&child=${s.childId}`
      }))
    });
  } catch (error) {
    console.error('Error getting merge suggestions:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /admin/keywords/merge
 * Merge child keyword into parent keyword
 * Body: { parentKeywordId, childKeywordId }
 */
router.post('/keywords/merge', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const { parentKeywordId, childKeywordId } = req.body;
    
    if (!parentKeywordId || !childKeywordId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing parentKeywordId or childKeywordId' 
      });
    }
    
    if (parentKeywordId === childKeywordId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Parent and child keywords must be different' 
      });
    }
    
    await mergeKeywords(pool, parentKeywordId, childKeywordId);
    
    return res.status(200).json({
      success: true,
      message: `Merged keyword ${childKeywordId} into ${parentKeywordId}`
    });
  } catch (error) {
    console.error('Error merging keywords:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /admin/keywords/by-qa/:qaId
 * View all keywords for a specific Q&A
 * Shows any substring duplicates
 */
router.get('/keywords/by-qa/:qaId', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const qaId = req.params.qaId;
    
    const [keywords] = await pool.query(
      `SELECT k.KeywordID, k.KeywordText, LENGTH(k.KeywordText) as length
       FROM Keywords k
       INNER JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID
       WHERE ak.QuestionsAnswersID = ?
       ORDER BY LENGTH(k.KeywordText) DESC`,
      [qaId]
    );
    
    // Find substring relationships
    const duplicates = [];
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        const rel = findSubstringRelationship(keywords[i].KeywordText, keywords[j].KeywordText);
        if (rel) {
          duplicates.push({
            parent: rel.parent,
            child: rel.child,
            suggestion: `Merge ${keywords[j].KeywordID} into ${keywords[i].KeywordID}`
          });
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      qaId,
      totalKeywords: keywords.length,
      keywords,
      duplicates
    });
  } catch (error) {
    console.error('Error getting Q&A keywords:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /admin/keywords/stats
 * Overview of keyword duplicates in system
 */
router.get('/keywords/stats', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    
    const [stats] = await pool.query(
      `SELECT 
        COUNT(DISTINCT KeywordID) as total_keywords,
        COUNT(DISTINCT ak.QuestionsAnswersID) as total_qalinked,
        AVG(qa_count) as avg_qa_per_keyword
       FROM Keywords k
       LEFT JOIN (
         SELECT KeywordID, COUNT(DISTINCT QuestionsAnswersID) as qa_count
         FROM AnswersKeywords
         GROUP BY KeywordID
       ) sub ON k.KeywordID = sub.KeywordID
       LEFT JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID`
    );
    
    return res.status(200).json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Quality Guard routes removed - feature discontinued

module.exports = router;