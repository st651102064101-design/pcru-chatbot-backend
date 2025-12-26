/**
 * API endpoints for cleaning up keywords in QA Management
 * Allows admins to remove unwanted keywords from QAs
 */

const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();
const config = require('../config');

/**
 * GET /keywords/suggestions/:qaId
 * Get keyword suggestions that could be removed from a QA
 * Shows all keywords with frequency analysis
 */
router.get('/suggestions/:qaId', async (req, res) => {
  const { qaId } = req.params;
  const pool = mysql.createPool({
    host: config.db?.host,
    user: config.db?.user,
    password: config.db?.password,
    database: config.db?.database,
    charset: 'utf8mb4'
  });

  try {
    // Get QA details
    const [qas] = await pool.query(
      'SELECT QuestionsAnswersID, QuestionTitle FROM QuestionsAnswers WHERE QuestionsAnswersID = ?',
      [qaId]
    );

    if (qas.length === 0) {
      return res.status(404).json({ error: 'QA not found' });
    }

    const qa = qas[0];

    // Get all keywords for this QA
    const [keywords] = await pool.query(`
      SELECT k.KeywordID, k.KeywordText
      FROM AnswersKeywords ak
      JOIN Keywords k ON ak.KeywordID = k.KeywordID
      WHERE ak.QuestionsAnswersID = ?
      ORDER BY k.KeywordText
    `, [qaId]);

    // Categorize keywords as related or outlier
    const relatedKeywords = [];
    const outlierKeywords = [];

    for (const kw of keywords) {
      const kwLower = kw.KeywordText.toLowerCase();
      const titleLower = qa.QuestionTitle.toLowerCase();
      
      // If keyword appears in title, it's related
      if (titleLower.includes(kwLower)) {
        relatedKeywords.push({
          id: kw.KeywordID,
          text: kw.KeywordText,
          status: 'related'
        });
      } else {
        outlierKeywords.push({
          id: kw.KeywordID,
          text: kw.KeywordText,
          status: 'outlier'
        });
      }
    }

    res.json({
      qaId,
      questionTitle: qa.QuestionTitle,
      totalKeywords: keywords.length,
      relatedKeywords,
      outlierKeywords,
      suggestion: outlierKeywords.length > 0 ? 
        `Consider removing ${outlierKeywords.length} outlier keywords` : 
        'All keywords seem related'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * DELETE /keywords/remove
 * Remove specific keywords from a QA
 * Body: { qaId, keywordIds: [1, 2, 3] }
 */
router.delete('/remove', async (req, res) => {
  const { qaId, keywordIds } = req.body;

  if (!qaId || !Array.isArray(keywordIds) || keywordIds.length === 0) {
    return res.status(400).json({ error: 'Missing qaId or keywordIds' });
  }

  const pool = mysql.createPool({
    host: config.db?.host,
    user: config.db?.user,
    password: config.db?.password,
    database: config.db?.database,
    charset: 'utf8mb4'
  });

  try {
    // Remove keywords
    const placeholders = keywordIds.map(() => '?').join(',');
    await pool.query(
      `DELETE FROM AnswersKeywords WHERE QuestionsAnswersID = ? AND KeywordID IN (${placeholders})`,
      [qaId, ...keywordIds]
    );

    res.json({
      success: true,
      message: `Removed ${keywordIds.length} keywords from QA#${qaId}`,
      removedCount: keywordIds.length
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * DELETE /keywords/bulkRemoveOutliers
 * Remove all outlier keywords from a QA (keywords not appearing in title)
 * Body: { qaId }
 */
router.delete('/bulkRemoveOutliers', async (req, res) => {
  const { qaId } = req.body;

  if (!qaId) {
    return res.status(400).json({ error: 'Missing qaId' });
  }

  const pool = mysql.createPool({
    host: config.db?.host,
    user: config.db?.user,
    password: config.db?.password,
    database: config.db?.database,
    charset: 'utf8mb4'
  });

  try {
    // Get QA title
    const [qas] = await pool.query(
      'SELECT QuestionTitle FROM QuestionsAnswers WHERE QuestionsAnswersID = ?',
      [qaId]
    );

    if (qas.length === 0) {
      return res.status(404).json({ error: 'QA not found' });
    }

    const qa = qas[0];
    const titleLower = qa.QuestionTitle.toLowerCase();

    // Get all keywords for this QA
    const [keywords] = await pool.query(`
      SELECT k.KeywordID, k.KeywordText
      FROM AnswersKeywords ak
      JOIN Keywords k ON ak.KeywordID = k.KeywordID
      WHERE ak.QuestionsAnswersID = ?
    `, [qaId]);

    // Find outliers (keywords not in title)
    const outlierIds = [];
    for (const kw of keywords) {
      if (!titleLower.includes(kw.KeywordText.toLowerCase())) {
        outlierIds.push(kw.KeywordID);
      }
    }

    if (outlierIds.length === 0) {
      return res.json({
        success: true,
        message: 'No outlier keywords to remove',
        removedCount: 0
      });
    }

    // Remove outlier keywords
    const placeholders = outlierIds.map(() => '?').join(',');
    await pool.query(
      `DELETE FROM AnswersKeywords WHERE QuestionsAnswersID = ? AND KeywordID IN (${placeholders})`,
      [qaId, ...outlierIds]
    );

    res.json({
      success: true,
      message: `Removed ${outlierIds.length} outlier keywords from QA#${qaId}`,
      removedCount: outlierIds.length
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

module.exports = router;
