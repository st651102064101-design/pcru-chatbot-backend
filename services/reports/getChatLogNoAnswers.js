/**
 * Service to get chat logs that have no answers.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getChatLogNoAnswersService = (pool) => async (req, res) => {
    try {
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const [rows] = await pool.query(
            `SELECT ChatLogID, Timestamp, UserQuery, Status
             FROM ChatLogNoAnswers
             ORDER BY Timestamp ${order}`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching ChatLogNoAnswers:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getChatLogNoAnswersService;
