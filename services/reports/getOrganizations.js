// services/reports/getOrganizations.js

const getOrganizationsService = (pool) => {
    return async (req, res) => {
        try {
            // default to DESC, allow ?order=asc for ascending
            const order = req.query && String(req.query.order || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
            const [rows] = await pool.query(
                `SELECT OrgID, OrgName, OrgDescription, AdminUserID FROM Organizations ORDER BY OrgName ${order}`
            );
            res.status(200).json(rows);
        } catch (error) {
            console.error('❌ Error fetching organizations:', error);
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    };
};

module.exports = getOrganizationsService;