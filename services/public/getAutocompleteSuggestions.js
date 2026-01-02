/**
 * Public service: return autocomplete suggestions across keywords, synonyms, and stopwords (no auth)
 *
 * GET /autocomplete/suggest?q=<text>&limit=<n>
 *
 * Response:
 *   { success: true, data: { query, suggestions: [{ text, type, target? }] } }
 */
module.exports = (pool) => async (req, res) => {
  try {
    const raw = (req.query.q ?? '').toString();
    const query = raw.trim();

    const limitRaw = parseInt((req.query.limit ?? '30').toString(), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 30;

    if (!query) {
      return res.status(200).json({
        success: true,
        data: { query, suggestions: [] }
      });
    }

    const qLower = query.toLowerCase();

    // For very short queries (1 char), return stopwords only to avoid noisy results
    const stopwordsOnly = query.length === 1;

    // Split limit budget across sources, with preference to keywords/synonyms
    const kwLimit = Math.min(limit, 20);
    const synLimit = Math.min(limit, 20);
    const swLimit = Math.min(limit, 15);

    const kwRows = stopwordsOnly
      ? []
      : (await pool.query(
          `SELECT DISTINCT KeywordText AS text
           FROM Keywords
           WHERE KeywordText IS NOT NULL
             AND TRIM(KeywordText) <> ''
             AND LOWER(KeywordText) LIKE CONCAT(?, '%')
           ORDER BY KeywordText ASC
           LIMIT ?`,
          [qLower, kwLimit]
        ))[0];

    const synRows = stopwordsOnly
      ? []
      : (await pool.query(
          `SELECT DISTINCT s.InputWord AS text, k.KeywordText AS target
           FROM KeywordSynonyms s
           LEFT JOIN Keywords k ON s.TargetKeywordID = k.KeywordID
           WHERE s.IsActive = 1
             AND s.InputWord IS NOT NULL
             AND TRIM(s.InputWord) <> ''
             AND LOWER(s.InputWord) LIKE CONCAT(?, '%')
           ORDER BY s.InputWord ASC
           LIMIT ?`,
          [qLower, synLimit]
        ))[0];

    const [swRows] = await pool.query(
      `SELECT DISTINCT StopwordText AS text
       FROM Stopwords
       WHERE StopwordText IS NOT NULL
         AND TRIM(StopwordText) <> ''
         AND LOWER(StopwordText) LIKE CONCAT(?, '%')
       ORDER BY StopwordText ASC
       LIMIT ?`,
      [qLower, swLimit]
    );

    const seen = new Set();
    const suggestions = [];

    const pushUnique = (text, type, extra = {}) => {
      const t = (text ?? '').toString().trim();
      if (!t) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push({ text: t, type, ...extra });
    };

    for (const r of kwRows || []) pushUnique(r.text, 'keyword');
    for (const r of synRows || []) pushUnique(r.text, 'synonym', r.target ? { target: r.target } : {});
    for (const r of swRows || []) pushUnique(r.text, 'stopword');

    const typeRank = { keyword: 0, synonym: 1, stopword: 2 };
    suggestions.sort((a, b) => {
      const ta = typeRank[a.type] ?? 9;
      const tb = typeRank[b.type] ?? 9;
      if (ta !== tb) return ta - tb;
      const la = (a.text || '').length;
      const lb = (b.text || '').length;
      if (la !== lb) return la - lb;
      return (a.text || '').localeCompare((b.text || ''), 'th');
    });

    return res.status(200).json({
      success: true,
      data: {
        query,
        suggestions: suggestions.slice(0, limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching autocomplete suggestions:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
