/**
 * Service to mark feedback as handled (for unlike feedbacks)
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const markFeedbackHandledService = (pool) => async (req, res) => {
    try {
        const { feedbackId } = req.params;
        
        if (!feedbackId) {
            return res.status(400).json({ 
                success: false, 
                message: 'FeedbackID is required' 
            });
        }

        // Mark as handled with current timestamp
        const [result] = await pool.query(
            `UPDATE Feedbacks 
             SET HandledAt = NOW() 
             WHERE FeedbackID = ? AND FeedbackValue = 0`,
            [feedbackId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Feedback not found or already handled' 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Feedback marked as handled',
            feedbackId: feedbackId
        });
    } catch (error) {
        console.error('❌ Error marking feedback as handled:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Service to get handled feedbacks (for cleanup report)
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getHandledFeedbacksService = (pool) => async (req, res) => {
    try {
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
                qa.QuestionsAnswersID,
                DATEDIFF(DATE_ADD(f.HandledAt, INTERVAL 30 DAY), NOW()) as DaysUntilDelete
             FROM Feedbacks f
             LEFT JOIN ChatLogHasAnswers c ON f.ChatLogID = c.ChatLogID
             LEFT JOIN QuestionsAnswers qa ON c.QuestionsAnswersID = qa.QuestionsAnswersID
             WHERE f.HandledAt IS NOT NULL
             ORDER BY f.HandledAt DESC`
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching handled feedbacks:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Service to cleanup handled feedbacks older than 30 days
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware or direct call
 */
const cleanupHandledFeedbacksService = (pool) => async (req, res) => {
    try {
        const [result] = await pool.query(
            `DELETE FROM Feedbacks 
             WHERE HandledAt IS NOT NULL 
             AND HandledAt < DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        const message = `Cleaned up ${result.affectedRows} handled feedbacks older than 30 days`;
        console.log(`🧹 ${message}`);

        if (res) {
            res.status(200).json({ 
                success: true, 
                message,
                deletedCount: result.affectedRows 
            });
        }
        
        return result.affectedRows;
    } catch (error) {
        console.error('❌ Error cleaning up handled feedbacks:', error);
        if (res) {
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
        throw error;
    }
};

/**
 * Service to restore a handled feedback back to unhandled (set HandledAt = NULL)
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const unhandleFeedbackService = (pool) => async (req, res) => {
    try {
        const { feedbackId } = req.params;
        if (!feedbackId) {
            return res.status(400).json({ success: false, message: 'FeedbackID is required' });
        }

        const [result] = await pool.query(
            `UPDATE Feedbacks
             SET HandledAt = NULL
             WHERE FeedbackID = ?`,
            [feedbackId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Feedback not found' });
        }

        res.status(200).json({ success: true, message: 'Feedback restored to unhandled', feedbackId });
    } catch (error) {
        console.error('❌ Error restoring feedback:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = {
    markFeedbackHandledService,
    getHandledFeedbacksService,
    cleanupHandledFeedbacksService,
    unhandleFeedbackService
};
