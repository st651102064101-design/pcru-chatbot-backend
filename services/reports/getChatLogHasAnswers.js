/**
 * Service to get chat logs that have answers.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getChatLogHasAnswersService = (pool) => async (req, res) => {
    try {
        // default to DESC, allow ?order=asc for ascending
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        // Join to QuestionsAnswers to include QuestionTitle for the answered chat logs
        const [rows] = await pool.query(
            `SELECT cl.ChatLogID, cl.Timestamp, cl.UserQuery, cl.Status, cl.QuestionsAnswersID,
                    qa.QuestionTitle
             FROM ChatLogHasAnswers cl
             LEFT JOIN QuestionsAnswers qa ON cl.QuestionsAnswersID = qa.QuestionsAnswersID
             ORDER BY cl.Timestamp ${order}`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching ChatLogHasAnswers:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getChatLogHasAnswersService;
