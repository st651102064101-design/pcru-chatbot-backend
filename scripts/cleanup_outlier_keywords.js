#!/usr/bin/env node
/**
 * Script to remove outlier/low-quality keywords from QAs
 * 🎯 Keeps only the most relevant keywords that appear frequently in QA content
 * 
 * Strategy:
 * - For each QA, calculate how many times each keyword appears in its content
 * - Keep keywords that appear >= 2 times (they're truly related)
 * - Remove keywords that appear 0-1 times (they're outliers/noise)
 * - This prevents the UI from being cluttered with too many keywords
 * 
 * Usage: node scripts/cleanup_outlier_keywords.js [--dry-run] [--qa-id <id>]
 */

const mysql = require('mysql2/promise');
const config = require('../config');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const qaIdIdx = args.indexOf('--qa-id');
const targetQaId = qaIdIdx >= 0 ? parseInt(args[qaIdIdx + 1]) : null;

async function main() {
  const pool = mysql.createPool({
    host: config.db?.host || process.env.DB_HOST,
    user: config.db?.user || process.env.DB_USER,
    password: config.db?.password || process.env.DB_PASSWORD,
    database: config.db?.database || process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4'
  });

  try {
    console.log('🎯 Cleaning up outlier keywords from QAs...');
    console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will delete)'}`);
    if (targetQaId) {
      console.log(`   Target: QA#${targetQaId} only\n`);
    } else {
      console.log('   Target: ALL QAs\n');
    }

    // Get all QAs with their keywords
    let qaQuery = `
      SELECT DISTINCT qa.QuestionsAnswersID, qa.QuestionTitle, qa.QuestionText
      FROM QuestionsAnswers qa
      WHERE qa.QuestionsAnswersID > 0
    `;
    
    if (targetQaId) {
      qaQuery += ` AND qa.QuestionsAnswersID = ${targetQaId}`;
    }

    const [qas] = await pool.query(qaQuery);
    console.log(`📊 Processing ${qas.length} QA(s)\n`);

    let totalRemoved = 0;
    let qaCount = 0;

    for (const qa of qas) {
      const qaId = qa.QuestionsAnswersID;
      
      // Get all keywords for this QA
      const [keywords] = await pool.query(`
        SELECT k.KeywordID, k.KeywordText
        FROM AnswersKeywords ak
        JOIN Keywords k ON ak.KeywordID = k.KeywordID
        WHERE ak.QuestionsAnswersID = ?
      `, [qaId]);

      if (keywords.length === 0) continue;

      // Get QA content for frequency analysis
      const qaContent = (qa.QuestionTitle + ' ' + qa.QuestionText).toLowerCase();

      // Count frequency of each keyword in QA content
      const keywordFrequency = {};
      const outlierKeywords = [];

      for (const kw of keywords) {
        const kwLower = kw.KeywordText.toLowerCase();
        const count = (qaContent.match(new RegExp('\\b' + kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
        
        keywordFrequency[kw.KeywordID] = {
          text: kw.KeywordText,
          frequency: count
        };

        // Outliers are keywords that appear 0 times (learned from other QAs with same keyword)
        // Or keywords that are clearly noise based on frequency
        if (count === 0) {
          outlierKeywords.push({
            id: kw.KeywordID,
            text: kw.KeywordText,
            frequency: count
          });
        }
      }

      // Log QA info
      if (outlierKeywords.length > 0) {
        qaCount++;
        console.log(`QA#${qaId}: ${qa.QuestionTitle.substring(0, 50)}...`);
        console.log(`  Total keywords: ${keywords.length}, Outliers: ${outlierKeywords.length}`);
        
        for (const okw of outlierKeywords) {
          console.log(`    ❌ "${okw.text}" (appears 0 times in content)`);
        }
        console.log();

        // Delete outlier keywords if not dry-run
        if (!dryRun) {
          for (const okw of outlierKeywords) {
            await pool.query(
              'DELETE FROM AnswersKeywords WHERE QuestionsAnswersID = ? AND KeywordID = ?',
              [qaId, okw.id]
            );
            totalRemoved++;
          }
        }
      }
    }

    // Summary
    if (dryRun) {
      console.log(`\n⚠️ DRY RUN: Would remove ${totalRemoved} outlier keyword links from ${qaCount} QA(s)`);
      console.log(`   Run without --dry-run to actually delete`);
    } else if (totalRemoved > 0) {
      console.log(`\n✅ Cleanup complete: removed ${totalRemoved} outlier keyword links from ${qaCount} QA(s)`);
    } else {
      console.log(`\n✅ No outlier keywords found!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
