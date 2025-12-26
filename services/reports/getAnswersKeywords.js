/**
 * Service to get all AnswersKeywords for the logged-in officer.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getAnswersKeywordsService = (pool) => async (req, res) => {
    try {
        const officerId = req.user?.userId;
        if (!officerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }
        // Join AnswersKeywords with QuestionsAnswers to filter by OfficerID
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const [rows] = await pool.query(
            `SELECT ak.QuestionsAnswers, ak.KeywordID
             FROM AnswersKeywords ak
             INNER JOIN QuestionsAnswers qa ON ak.QuestionsAnswers = qa.QuestionsAnswers
             WHERE qa.OfficerID = ?
             ORDER BY ak.QuestionsAnswers ${order}`,
            [officerId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching AnswersKeywords:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getAnswersKeywordsService;
