// services/reports/getAdminUsers.js

const getAdminUsersService = (pool) => {
    return async (req, res) => {
        try {
            // Fetch all admin users for superadmin dashboard view
            // Add Role column based on ParentAdminID (if ParentAdminID == AdminUserID -> Super Admin)
            // allow optional order query param: ?order=asc will order ascending, anything else defaults to DESC
            const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
            const [rows] = await pool.query(
                `SELECT AdminUserID, AdminName, AdminEmail, ParentAdminID,
                        CASE WHEN ParentAdminID = AdminUserID THEN 'Super Admin' ELSE 'Admin' END AS Role
                 FROM AdminUsers ORDER BY AdminName ${order}`
            );
            res.status(200).json(rows);
        } catch (error) {
            console.error('❌ Error fetching admin users:', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    };
};

module.exports = getAdminUsersService;