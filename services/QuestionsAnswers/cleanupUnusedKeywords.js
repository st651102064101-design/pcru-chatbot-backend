/**
 * services/QuestionsAnswers/cleanupUnusedKeywords.js
 * ลบ keywords ที่ไม่ใช้งานแล้ว (orphaned keywords)
 * Keywords ที่ไม่มีการอ้างอิงจาก AnswersKeywords ตาราง
 */

/**
 * Clean up orphaned keywords (keywords ที่ไม่ติดกับ QA ใด ๆ แล้ว)
 * @param {Connection} connection - MySQL connection
 * @returns {Object} { deletedCount, deletedKeywords }
 */
async function cleanupUnusedKeywords(connection, excludeNormalized = []) {
  try {
    // 1. หา keywords ที่ไม่ถูกใช้ (orphaned)
    // หากมีรายการที่จะยกเว้น (excludeNormalized), อย่าเลือกคีย์เวิร์ดเหล่านั้นเพื่อหลีกเลี่ยงการลบ
    const excludeClause = (Array.isArray(excludeNormalized) && excludeNormalized.length > 0)
      ? `AND k.NormalizedText NOT IN (${excludeNormalized.map(() => '?').join(',')})`
      : '';

    const sql = `
      SELECT k.KeywordID, k.KeywordText, k.NormalizedText
      FROM Keywords k
      LEFT JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID
      WHERE ak.KeywordID IS NULL
      ${excludeClause}
    `;

    const params = Array.isArray(excludeNormalized) && excludeNormalized.length > 0 ? excludeNormalized : [];
    const [orphanedKeywords] = await connection.query(sql, params);

    if (orphanedKeywords.length === 0) {
      console.log('ℹ️ No orphaned keywords found');
      return { deletedCount: 0, deletedKeywords: [] };
    }

    // 2. ลบ keywords ที่ orphaned
    const orphanedIds = orphanedKeywords.map(k => k.KeywordID);
    await connection.query(
      `DELETE FROM Keywords WHERE KeywordID IN (${orphanedIds.map(() => '?').join(',')})`,
      orphanedIds
    );

    const deletedKeywords = orphanedKeywords.map(k => ({
      id: k.KeywordID,
      text: k.KeywordText
    }));

    console.log(`✅ Cleaned up ${orphanedKeywords.length} orphaned keywords:`, deletedKeywords.map(k => k.text).join(', '));

    return {
      deletedCount: orphanedKeywords.length,
      deletedKeywords: deletedKeywords
    };
  } catch (error) {
    console.error('❌ Error cleaning up unused keywords:', error.message);
    throw error;
  }
}

module.exports = cleanupUnusedKeywords;
