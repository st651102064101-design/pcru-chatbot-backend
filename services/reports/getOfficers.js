// services/reports/getOfficers.js

const getOfficersService = (pool) => {
    return async (req, res) => {
        try {
            // Get the admin ID of the logged-in user from the token
            const adminId = req.user?.userId;

            if (!adminId) {
                return res.status(401).json({ success: false, message: 'Unauthorized: Could not identify the user from the token.' });
            }

            // Query to fetch officers related to the logged-in admin (supports ?order=asc)
            const order = String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
            const [rows] = await pool.query(
                `SELECT o.OfficerID, o.OfficerName, o.OfficerPhone, o.Email AS OfficerEmail, 1 AS OfficerStatus,
                        org.OrgName
                 FROM Officers o
                 LEFT JOIN Organizations org ON o.OrgID = org.OrgID
                 WHERE o.AdminUserID = ? OR o.AdminUserID IN (SELECT AdminUserID FROM AdminUsers WHERE ParentAdminID = ?)
                 ORDER BY o.OfficerID ${order}`,
                [adminId, adminId]
            );

            res.status(200).json(rows);
        } catch (error) {
            console.error('❌ Error fetching officers:', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    };
};

module.exports = getOfficersService;