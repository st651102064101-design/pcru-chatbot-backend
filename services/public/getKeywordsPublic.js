/**
 * Public service: return all distinct keywords (no auth)
 */
module.exports = (pool) => async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT KeywordID, KeywordText
       FROM Keywords
       WHERE KeywordText IS NOT NULL AND TRIM(KeywordText) <> ''
       ORDER BY KeywordText ASC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error fetching public keywords:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
