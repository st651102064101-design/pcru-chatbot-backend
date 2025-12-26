/**
 * Service to get all keywords for the logged-in officer.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getKeywordsService = (pool) => async (req, res) => {
    try {
        const officerId = req.user?.userId;
        if (!officerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const [rows] = await pool.query(
            `SELECT KeywordID, KeywordText, OfficerID
             FROM Keywords
             WHERE OfficerID = ?
             ORDER BY KeywordText ${order}`,
            [officerId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error fetching keywords:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getKeywordsService;
