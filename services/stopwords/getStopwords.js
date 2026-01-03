/**
 * Service to get all stopwords
 */
const getStopwordsService = (pool) => async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
        ROW_NUMBER() OVER (ORDER BY StopwordID ASC) as RowNum,
        StopwordID, StopwordText, CreatedAt, UpdatedAt
       FROM Stopwords
       ORDER BY StopwordID DESC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error('❌ Error fetching stopwords:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = getStopwordsService;
