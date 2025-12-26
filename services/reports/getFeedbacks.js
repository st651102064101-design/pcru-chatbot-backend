/**
 * Service to get all feedbacks for the logged-in officer.
 * Only returns feedbacks that haven't been handled yet.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getFeedbacksService = (pool) => async (req, res) => {
    try {
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const [rows] = await pool.query(
            `SELECT 
                f.FeedbackID, 
                f.FeedbackValue, 
                f.Timestamp, 
                f.ChatLogID,
                f.FeedbackReason,
                f.FeedbackComment,
                f.HandledAt,
                c.UserQuery,
                qa.QuestionText,
                qa.QuestionsAnswersID
             FROM Feedbacks f
             LEFT JOIN ChatLogHasAnswers c ON f.ChatLogID = c.ChatLogID
             LEFT JOIN QuestionsAnswers qa ON c.QuestionsAnswersID = qa.QuestionsAnswersID
             WHERE f.HandledAt IS NULL
             ORDER BY f.Timestamp ${order}`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching feedbacks:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getFeedbacksService;
