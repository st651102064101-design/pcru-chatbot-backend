/**
 * Deduplicate and merge similar keywords
 * Problem: Keywords like "ทุน", "ทุนเรียนดี", "ขอทุน" point to same Q&As
 * Solution: Keep parent keyword only, redirect child keywords
 */

/**
 * Find if keyword is a substring of another (or vice versa)
 * Returns { parent, child } if found, null otherwise
 * 🛡️ IMPORTANT: Don't mark short important keywords as children
 */
function findSubstringRelationship(keyword1, keyword2) {
  const k1 = keyword1.toLowerCase().trim();
  const k2 = keyword2.toLowerCase().trim();
  
  // Ignore identical
  if (k1 === k2) return null;
  
  // Ignore if one is too short (< 2 chars)
  if (k1.length < 2 || k2.length < 2) return null;
  
  // 🛡️ PROTECTION: Don't remove short keywords (≤ 4 chars) as they might be important search terms
  // Users often search with short keywords like "ทุน", "หอ", "ข่าว"
  const MIN_REMOVABLE_LENGTH = 5;
  
  // Check substring relationship
  if (k1.includes(k2)) {
    // k2 is shorter (potential child) - protect if too short
    if (k2.length < MIN_REMOVABLE_LENGTH) {
      console.log(`  🛡️ Protecting short keyword "${k2}" - won't remove (length=${k2.length} < ${MIN_REMOVABLE_LENGTH})`);
      return null;
    }
    return { parent: k1, child: k2 };
  }
  if (k2.includes(k1)) {
    // k1 is shorter (potential child) - protect if too short
    if (k1.length < MIN_REMOVABLE_LENGTH) {
      console.log(`  🛡️ Protecting short keyword "${k1}" - won't remove (length=${k1.length} < ${MIN_REMOVABLE_LENGTH})`);
      return null;
    }
    return { parent: k2, child: k1 };
  }
  
  return null;
}

/**
 * Deduplicate keywords for a specific Q&A
 * Remove redundant keywords (keep parent only)
 * @param {Pool} pool - MySQL connection pool
 * @param {number} qaId - QuestionsAnswersID
 */
const deduplicateQAKeywords = async (pool, qaId) => {
  if (!qaId) return;

  try {
    // Get all keywords for this Q&A
    const [rows] = await pool.query(
      `SELECT DISTINCT k.KeywordID, k.KeywordText
       FROM Keywords k
       INNER JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID
       WHERE ak.QuestionsAnswersID = ?
       ORDER BY LENGTH(k.KeywordText) DESC`,
      [qaId]
    );

    if (rows.length < 2) {
      console.log(`  ⏭️ Skip deduplication: Q&A ${qaId} has only ${rows.length} keyword(s)`);
      return;
    }

    const keywordsToRemove = [];
    const checked = new Set();

    // Find substring relationships
    for (let i = 0; i < rows.length; i++) {
      const kw1 = rows[i];
      if (checked.has(kw1.KeywordID)) continue;

      for (let j = i + 1; j < rows.length; j++) {
        const kw2 = rows[j];
        if (checked.has(kw2.KeywordID)) continue;

        const rel = findSubstringRelationship(kw1.KeywordText, kw2.KeywordText);
        if (rel) {
          // kw1 is parent (longer), kw2 is child (shorter)
          // Mark child for removal
          keywordsToRemove.push({
            qaId,
            childKeywordId: kw2.KeywordID,
            parentKeywordId: kw1.KeywordID,
            childText: kw2.KeywordText,
            parentText: kw1.KeywordText
          });
          checked.add(kw2.KeywordID);
          console.log(`  🧹 Found: "${kw1.KeywordText}" contains "${kw2.KeywordText}"`);
        }
      }
    }

    // Remove redundant keywords
    for (const removal of keywordsToRemove) {
      await pool.query(
        `DELETE FROM AnswersKeywords 
         WHERE QuestionsAnswersID = ? AND KeywordID = ?`,
        [removal.qaId, removal.childKeywordId]
      );
      console.log(
        `🧹 Deduplicate Q&A ${removal.qaId}: ` +
        `removed "${removal.childText}" (kept "${removal.parentText}")`
      );
    }

    if (keywordsToRemove.length > 0) {
      console.log(`✅ Deduplicated ${keywordsToRemove.length} keyword(s) for Q&A ${qaId}`);
    }
  } catch (error) {
    console.error('❌ Error deduplicating keywords:', error.message);
  }
};

/**
 * Analyze and suggest keyword merges (for admin review)
 * @param {Pool} pool - MySQL connection pool
 * @returns {Array} suggestions { parent, child, affectedQAs }
 */
const suggestKeywordMerges = async (pool) => {
  try {
    const [rows] = await pool.query(
      `SELECT k1.KeywordID as k1_id, k1.KeywordText as k1_text,
              k2.KeywordID as k2_id, k2.KeywordText as k2_text,
              COUNT(DISTINCT ak1.QuestionsAnswersID) as shared_qa_count
       FROM Keywords k1
       INNER JOIN Keywords k2 ON 
         k1.KeywordID < k2.KeywordID AND
         (k1.KeywordText LIKE CONCAT('%', k2.KeywordText, '%') OR
          k2.KeywordText LIKE CONCAT('%', k1.KeywordText, '%'))
       INNER JOIN AnswersKeywords ak1 ON k1.KeywordID = ak1.KeywordID
       INNER JOIN AnswersKeywords ak2 ON k2.KeywordID = ak2.KeywordID
         AND ak1.QuestionsAnswersID = ak2.QuestionsAnswersID
       GROUP BY k1.KeywordID, k1.KeywordText, k2.KeywordID, k2.KeywordText
       HAVING shared_qa_count >= 1
       ORDER BY shared_qa_count DESC, LENGTH(k1.KeywordText) DESC`
    );

    const suggestions = [];
    for (const row of rows) {
      const rel = findSubstringRelationship(row.k1_text, row.k2_text);
      if (rel) {
        suggestions.push({
          parent: rel.parent,
          parentId: rel.parent === row.k1_text ? row.k1_id : row.k2_id,
          child: rel.child,
          childId: rel.child === row.k1_text ? row.k1_id : row.k2_id,
          sharedQACount: row.shared_qa_count
        });
      }
    }

    console.log(`📊 Found ${suggestions.length} keyword merge suggestions`);
    return suggestions;
  } catch (error) {
    console.error('❌ Error suggesting merges:', error.message);
    return [];
  }
};

/**
 * Merge two keywords (redirect child to parent)
 * @param {Pool} pool - MySQL connection pool
 * @param {number} parentKeywordId - ID to keep
 * @param {number} childKeywordId - ID to merge into parent
 */
const mergeKeywords = async (pool, parentKeywordId, childKeywordId) => {
  if (!parentKeywordId || !childKeywordId) return;
  if (parentKeywordId === childKeywordId) return;

  try {
    // Move all Q&As from child to parent
    await pool.query(
      `UPDATE AnswersKeywords 
       SET KeywordID = ? 
       WHERE KeywordID = ? 
       AND QuestionsAnswersID NOT IN (
         SELECT QuestionsAnswersID FROM AnswersKeywords WHERE KeywordID = ?
       )`,
      [parentKeywordId, childKeywordId, parentKeywordId]
    );

    // Remove duplicate associations
    await pool.query(
      `DELETE FROM AnswersKeywords WHERE KeywordID = ?`,
      [childKeywordId]
    );

    // Optionally: delete unused child keyword
    const [orphaned] = await pool.query(
      `SELECT KeywordID FROM Keywords WHERE KeywordID = ? AND KeywordID NOT IN (
        SELECT DISTINCT KeywordID FROM AnswersKeywords
      )`,
      [childKeywordId]
    );

    if (orphaned.length > 0) {
      await pool.query(`DELETE FROM Keywords WHERE KeywordID = ?`, [childKeywordId]);
      console.log(`🗑️ Deleted orphaned child keyword: ${childKeywordId}`);
    }

    console.log(`✅ Merged keyword ${childKeywordId} into ${parentKeywordId}`);
  } catch (error) {
    console.error('❌ Error merging keywords:', error.message);
  }
};

module.exports = {
  deduplicateQAKeywords,
  suggestKeywordMerges,
  mergeKeywords,
  findSubstringRelationship
};
