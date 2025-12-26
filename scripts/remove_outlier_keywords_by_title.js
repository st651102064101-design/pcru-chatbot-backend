#!/usr/bin/env node
/**
 * Script to remove outlier keywords (keywords not in QA title)
 * Usage: node scripts/remove_outlier_keywords_by_title.js [--qa-id <id>]
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const args = process.argv.slice(2);
const qaIdIdx = args.indexOf('--qa-id');
const targetQaId = qaIdIdx >= 0 ? parseInt(args[qaIdIdx + 1]) : null;

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  });

  try {
    console.log('🎯 Removing outlier keywords (not in QA title)...\n');
    
    if (targetQaId) {
      console.log(`📍 Processing QA#${targetQaId} only\n`);
    }

    // Get all QAs
    let query = 'SELECT QuestionsAnswersID, QuestionTitle FROM QuestionsAnswers WHERE QuestionsAnswersID > 0';
    if (targetQaId) {
      query += ` AND QuestionsAnswersID = ${targetQaId}`;
    }

    const [qas] = await pool.query(query);
    console.log(`📊 Processing ${qas.length} QA(s)\n`);

    let totalRemoved = 0;

    for (const qa of qas) {
      const qaId = qa.QuestionsAnswersID;
      const titleLower = qa.QuestionTitle.toLowerCase();

      // Get all keywords for this QA
      const [keywords] = await pool.query(`
        SELECT k.KeywordID, k.KeywordText
        FROM AnswersKeywords ak
        JOIN Keywords k ON ak.KeywordID = k.KeywordID
        WHERE ak.QuestionsAnswersID = ?
      `, [qaId]);

      if (keywords.length === 0) continue;

      // Find outliers (keywords not in title)
      const outlierIds = [];
      const relatedKeywords = [];

      for (const kw of keywords) {
        if (titleLower.includes(kw.KeywordText.toLowerCase())) {
          relatedKeywords.push(kw.KeywordText);
        } else {
          outlierIds.push(kw.KeywordID);
        }
      }

      if (outlierIds.length === 0) continue;

      // Show QA info
      console.log(`QA#${qaId}: ${qa.QuestionTitle}`);
      console.log(`  Keywords: ${keywords.length} total (${relatedKeywords.length} related, ${outlierIds.length} outliers)`);
      console.log(`  ✅ Keep: ${relatedKeywords.join(', ')}`);
      console.log(`  ❌ Remove: ${keywords.filter(kw => outlierIds.includes(kw.KeywordID)).map(kw => kw.KeywordText).slice(0, 5).join(', ')}${outlierIds.length > 5 ? '...' : ''}`);

      // Delete outlier keywords
      const placeholders = outlierIds.map(() => '?').join(',');
      await pool.query(
        `DELETE FROM AnswersKeywords WHERE QuestionsAnswersID = ? AND KeywordID IN (${placeholders})`,
        [qaId, ...outlierIds]
      );

      totalRemoved += outlierIds.length;
      console.log(`  ✅ Removed ${outlierIds.length} outlier keywords\n`);
    }

    console.log(`\n✅ Complete: Removed ${totalRemoved} total outlier keyword links`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
