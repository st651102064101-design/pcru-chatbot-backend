/**
 * Service to get all categories for the logged-in officer.
 * @param {object} pool - MySQL connection pool
 * @returns {function} - Express middleware (req, res)
 */
const getCategoriesService = (pool) => async (req, res) => {
    try {
        const officerId = req.user?.userId;
        if (!officerId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
        }
        // ส่งชื่อหมวดหมู่แทนรหัส (CategoriesID จะเป็นชื่อ)
        // If the user is an Officer, return both their categories and global ones (OfficerID IS NULL).
        // If the user is an Admin (or other non-officer), return global categories (OfficerID IS NULL).
        const usertype = req.user?.usertype;
        let rows;
        const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        if (usertype === 'Officer') {
            [rows] = await pool.query(
                `SELECT CategoriesID, CategoriesName, OfficerID, ParentCategoriesID, CategoriesPDF
                 FROM Categories
                 WHERE OfficerID = ? OR OfficerID IS NULL
                 ORDER BY CategoriesID ${order}`,
                [officerId]
            );
        } else {
            [rows] = await pool.query(
                `SELECT CategoriesID, CategoriesName, OfficerID, ParentCategoriesID, CategoriesPDF
                 FROM Categories
                 WHERE OfficerID IS NULL
                 ORDER BY CategoriesID ${order}`
            );
        }
        res.status(200).json({ success: true, categories: rows, count: Array.isArray(rows) ? rows.length : 0 });
    } catch (error) {
        console.error('❌ Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

module.exports = getCategoriesService;
