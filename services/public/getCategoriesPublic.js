/**
 * Public service: return categories without requiring authentication.
 * Returns all categories including subcategories for frontend to build tree.
 */
module.exports = (pool) => async (req, res) => {
  try {
    // Return ALL categories so frontend can build the tree structure
    // The frontend will filter root categories (ParentCategoriesID = CategoriesID or NULL)
    // and attach children to their parents
    const onlyWithAnswers = String(req.query?.onlyWithAnswers || '').toLowerCase() === '1' || String(req.query?.onlyWithAnswers || '').toLowerCase() === 'true';

    // When filtering for categories that have answers, include the QA count per category
    if (onlyWithAnswers) {
      const [rowsWithCount] = await pool.query(
        `SELECT
           c.CategoriesID COLLATE utf8mb4_unicode_ci   AS CategoriesID,
           c.CategoriesName COLLATE utf8mb4_unicode_ci AS CategoriesName,
           c.ParentCategoriesID COLLATE utf8mb4_unicode_ci AS ParentCategoriesID,
           c.CategoriesPDF COLLATE utf8mb4_unicode_ci  AS CategoriesPDF,
           (SELECT GROUP_CONCAT(Contact SEPARATOR ' ||| ') FROM Categories_Contact cc2 WHERE cc2.CategoriesID = c.CategoriesID) AS Contact,
           COUNT(qa.QuestionsAnswersID) AS qaCount
         FROM Categories c
         LEFT JOIN QuestionsAnswers qa ON qa.CategoriesID = c.CategoriesID
         GROUP BY c.CategoriesID, c.CategoriesName, c.ParentCategoriesID, c.CategoriesPDF
         ORDER BY c.CategoriesName COLLATE utf8mb4_unicode_ci ASC`
      );

      // Convert to objects with qaCount and then filter out categories (and their parents) that don't have answers
      const rows = (rowsWithCount || []).map(r => ({ CategoriesID: r.CategoriesID, CategoriesName: r.CategoriesName, ParentCategoriesID: r.ParentCategoriesID, CategoriesPDF: r.CategoriesPDF, Contact: String(r.Contact || ''), qaCount: r.qaCount || 0 }));

      // Build map to propagate child qaCount presence to parents
      const hasAnswersMap = {};
      rows.forEach(r => { hasAnswersMap[String(r.CategoriesID)] = (r.qaCount || 0) > 0; });

      // If a child has answers, mark parent as having answers so top-level categories remain visible
      let changed = true;
      while (changed) {
        changed = false;
        rows.forEach(r => {
          const parent = r.ParentCategoriesID == null ? null : String(r.ParentCategoriesID);
          const id = String(r.CategoriesID);
          if (parent && parent !== id && hasAnswersMap[id] && !hasAnswersMap[parent]) {
            hasAnswersMap[parent] = true;
            changed = true;
          }
        });
      }

      const filtered = rows.filter(r => hasAnswersMap[String(r.CategoriesID)]);
      const out = filtered.map(r => ({ CategoriesID: r.CategoriesID, CategoriesName: r.CategoriesName, ParentCategoriesID: r.ParentCategoriesID, CategoriesPDF: r.CategoriesPDF, Contact: r.Contact }));

      res.status(200).json({ success: true, categories: out, count: out.length });
      return;
    }

    const [rows] = await pool.query(
      `SELECT
         c.CategoriesID COLLATE utf8mb4_unicode_ci   AS CategoriesID,
         c.CategoriesName COLLATE utf8mb4_unicode_ci AS CategoriesName,
         c.ParentCategoriesID COLLATE utf8mb4_unicode_ci AS ParentCategoriesID,
         c.CategoriesPDF COLLATE utf8mb4_unicode_ci  AS CategoriesPDF,
         (SELECT GROUP_CONCAT(Contact SEPARATOR ' ||| ') FROM Categories_Contact cc2 WHERE cc2.CategoriesID = c.CategoriesID) AS Contact
       FROM Categories c
       ORDER BY c.CategoriesName COLLATE utf8mb4_unicode_ci ASC`
    );
    // Ensure Contact property exists
    const out = (Array.isArray(rows) ? rows.map(r => ({ CategoriesID: r.CategoriesID, CategoriesName: r.CategoriesName, ParentCategoriesID: r.ParentCategoriesID, CategoriesPDF: r.CategoriesPDF, Contact: String(r.Contact || '') })) : rows);

    // Debug: log sample of public categories
    try {
      console.log('[getCategoriesPublic] sample:', Array.isArray(out) ? out.slice(0,5).map(r => ({ CategoriesID: r.CategoriesID, Contact: r.Contact })) : out);
    } catch (e) {
      console.warn('[getCategoriesPublic] failed to log sample:', e && (e.message || e));
    }

    res.status(200).json({ success: true, categories: out, count: Array.isArray(out) ? out.length : 0 });
  } catch (error) {
    console.error('❌ Error fetching public categories:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
