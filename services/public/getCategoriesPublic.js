/**
 * Public service: return categories without requiring authentication.
 * Returns all categories including subcategories for frontend to build tree.
 */
module.exports = (pool) => async (req, res) => {
  try {
    // Return ALL categories so frontend can build the tree structure
    // The frontend will filter root categories (ParentCategoriesID = CategoriesID or NULL)
    // and attach children to their parents
    const [rows] = await pool.query(
      `SELECT
         c.CategoriesID COLLATE utf8mb4_unicode_ci   AS CategoriesID,
         c.CategoriesName COLLATE utf8mb4_unicode_ci AS CategoriesName,
         c.ParentCategoriesID COLLATE utf8mb4_unicode_ci AS ParentCategoriesID,
         c.CategoriesPDF COLLATE utf8mb4_unicode_ci  AS CategoriesPDF
       FROM Categories c
       ORDER BY c.CategoriesName COLLATE utf8mb4_unicode_ci ASC`
    );
    res.status(200).json({ success: true, categories: rows, count: Array.isArray(rows) ? rows.length : 0 });
  } catch (error) {
    console.error('❌ Error fetching public categories:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
