/**
 * cleanupOldLogs.js
 * ลบข้อมูล ChatLogHasAnswers, ChatLogNoAnswers, และ Feedbacks ที่เก่ากว่า 7 วัน
 * คำนวณจากวันที่จัดเก็บ (Timestamp/FeedbackDate)
 */

const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS) || 7;

/**
 * ลบข้อมูลเก่าจากตาราง ChatLogHasAnswers, ChatLogNoAnswers, Feedbacks
 * @param {Pool} pool - MySQL connection pool
 * @returns {Promise<{hasAnswers: number, noAnswers: number, feedbacks: number}>}
 */
async function cleanupOldLogs(pool) {
  const results = {
    hasAnswers: 0,
    noAnswers: 0,
    feedbacks: 0,
  };

  let connection;
  try {
    connection = await pool.getConnection();

    // ลบ ChatLogHasAnswers ที่เก่ากว่า RETENTION_DAYS วัน
    const [hasAnswersResult] = await connection.query(
      `DELETE FROM ChatLogHasAnswers WHERE Timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS]
    );
    results.hasAnswers = hasAnswersResult.affectedRows || 0;

    // ลบ ChatLogNoAnswers ที่เก่ากว่า RETENTION_DAYS วัน
    const [noAnswersResult] = await connection.query(
      `DELETE FROM ChatLogNoAnswers WHERE Timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS]
    );
    results.noAnswers = noAnswersResult.affectedRows || 0;

    // ลบ Feedbacks ที่เก่ากว่า RETENTION_DAYS วัน
    const [feedbacksResult] = await connection.query(
      `DELETE FROM Feedbacks WHERE FeedbackDate < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [RETENTION_DAYS]
    );
    results.feedbacks = feedbacksResult.affectedRows || 0;

    console.log(
      `[cleanup] Deleted old logs (>${RETENTION_DAYS} days): HasAnswers=${results.hasAnswers}, NoAnswers=${results.noAnswers}, Feedbacks=${results.feedbacks}`
    );
  } catch (err) {
    console.error('[cleanup] cleanupOldLogs error:', err && err.message);
  } finally {
    if (connection) connection.release();
  }

  return results;
}

module.exports = { cleanupOldLogs, RETENTION_DAYS };
