// ✨ Enhanced respond.js - Fixed & Reordered
const { getStopwordsSet } = require('../stopwords/loadStopwords');
const NEG_KW_MODULE = require('../negativeKeywords/loadNegativeKeywords');
// Extract functions safely (fallback if module structure differs)
const simpleTokenize = NEG_KW_MODULE.simpleTokenize || ((t) => [t]);
const analyzeQueryNegation = NEG_KW_MODULE.analyzeQueryNegation || (() => ({ hasNegation: false }));
const checkNegation = NEG_KW_MODULE.checkNegation || (() => ({ isNegated: false }));
const getNegativeKeywordsMap = NEG_KW_MODULE.getNegativeKeywordsMap || (() => ({}));
const INLINE_NEGATION_PATTERNS = NEG_KW_MODULE.INLINE_NEGATION_PATTERNS || [];
const { calculateFinalRanking } = require('../ranking/calculateFinalRanking');

// --- Global Caches ---
let SEMANTIC_SIM_MAP = {};
let getSemanticSimilarity = (a, b) => 0;
let SYNONYMS_MAPPING = {};
const BOT_PRONOUN = process.env.BOT_PRONOUN || 'หนู';
const NEGATION_BLOCKS = new Map();

// --- Configuration ---
const KW_SIM_THRESHOLD = parseFloat(process.env.KW_SIM_THRESHOLD) || 0.5;
const TOKENIZER_HOST = process.env.TOKENIZER_HOST || 'project.3bbddns.com';
const TOKENIZER_PORT = process.env.TOKENIZER_PORT || '36146';
const TOKENIZER_PATH = process.env.TOKENIZER_PATH || '/tokenize';
const TOKENIZER_URL = process.env.TOKENIZER_URL || `http://${TOKENIZER_HOST}:${TOKENIZER_PORT}${TOKENIZER_PATH}`;

// --------------------------------------------------------------------------------
// HELPER FUNCTIONS (Defined BEFORE usage)
// --------------------------------------------------------------------------------

async function fetchQAWithKeywords(connection) {
  const [rows] = await connection.query(`
    SELECT qa.QuestionsAnswersID, qa.QuestionTitle, qa.ReviewDate, qa.QuestionText, qa.OfficerID,
           c.CategoriesName AS CategoriesID, c.CategoriesPDF
    FROM QuestionsAnswers qa
    LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID
  `);
  const result = [];
  for (const row of rows) {
    const [keywords] = await connection.query(`
      SELECT k.KeywordText
      FROM Keywords k
      INNER JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID
      WHERE ak.QuestionsAnswersID = ?`, [row.QuestionsAnswersID]);
    result.push({ ...row, keywords: (keywords || []).map(k => k.KeywordText) });
  }
  return result;
}

function getSessionKey(req) {
  try {
    if (!req) return 'anonymous';
    const sid = (req.session && (req.session.id || req.sessionID)) ? (req.session.id || req.sessionID) : null;
    if (sid) return String(sid);
    if (req.ip) return String(req.ip);
    return 'anonymous';
  } catch (e) { return 'anonymous'; }
}

function loadBlockedDomains(req) {
  try {
    const s = (req && req.session && req.session.blockedDomains) ? req.session.blockedDomains : [];
    return new Set(Array.isArray(s) ? s : []);
  } catch (e) { return new Set(); }
}

function loadBlockedKeywords(req) {
  try {
    const s = (req && req.session && req.session.blockedKeywords) ? req.session.blockedKeywords : [];
    return new Set(Array.isArray(s) ? s : []);
  } catch (e) { return new Set(); }
}

function clearBlockedDomains(req) {
  try {
    if (req && req.session) {
      req.session.blockedDomains = [];
      req.session.blockedKeywords = [];
    }
  } catch (e) { }
}

function persistBlockedKeywords(req, keywords) {
  try {
    if (!Array.isArray(keywords)) return;
    const existing = loadBlockedKeywords(req);
    const combined = new Set([...(existing || []), ...keywords.map(k => String(k).toLowerCase())]);
    if (req && req.session) req.session.blockedKeywords = Array.from(combined);
    const key = getSessionKey(req);
    const entry = NEGATION_BLOCKS.get(key) || { blockedDomains: new Set(), blockedKeywords: new Set(), updatedAt: 0 };
    entry.blockedKeywords = new Set(Array.from(entry.blockedKeywords || []).concat(Array.from(combined)));
    entry.updatedAt = Date.now();
    NEGATION_BLOCKS.set(key, entry);
  } catch (e) { console.warn('persistBlockedKeywords failed', e && (e.message || e)); }
}

function persistBlockedDomains(req, domains) {
  try {
    if (!Array.isArray(domains)) return;
    const existing = loadBlockedDomains(req);
    const combined = new Set([...(existing || []), ...domains.map(d => String(d).toLowerCase())]);
    if (req && req.session) req.session.blockedDomains = Array.from(combined);
    const key = getSessionKey(req);
    const entry = NEGATION_BLOCKS.get(key) || { blockedDomains: new Set(), blockedKeywords: new Set(), updatedAt: 0 };
    entry.blockedDomains = new Set(Array.from(entry.blockedDomains || []).concat(Array.from(combined)));
    entry.updatedAt = Date.now();
    NEGATION_BLOCKS.set(key, entry);
  } catch (e) { console.warn('persistBlockedDomains failed', e && (e.message || e)); }
}

function resolveSynonyms(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  try {
    return tokens.map(t => {
      const k = String(t || '').toLowerCase().trim();
      if (SYNONYMS_MAPPING && SYNONYMS_MAPPING[k]) return SYNONYMS_MAPPING[k];
      return t;
    });
  } catch (e) { return tokens; }
}

async function loadSemanticData(pool) {
  try {
    const loader = require('../semanticData/loadSemanticData');
    const map = await loader.getSemanticSimilarity(pool);
    SEMANTIC_SIM_MAP = map || {};
    getSemanticSimilarity = (w1, w2) => {
      try {
        if (!w1 || !w2) return 0;
        if (SEMANTIC_SIM_MAP[w1] && typeof SEMANTIC_SIM_MAP[w1][w2] !== 'undefined') return SEMANTIC_SIM_MAP[w1][w2];
        return 0;
      } catch (e) { return 0; }
    };
    return SEMANTIC_SIM_MAP;
  } catch (e) {
    SEMANTIC_SIM_MAP = {};
    getSemanticSimilarity = () => 0;
    return {};
  }
}

async function loadSynonymsMapping(pool) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(`SELECT s.InputWord AS input, k.KeywordText AS target FROM KeywordSynonyms s JOIN Keywords k ON s.TargetKeywordID = k.KeywordID WHERE s.IsActive = 1`);
    connection.release();
    SYNONYMS_MAPPING = {};
    for (const r of rows || []) {
      if (r && r.input && r.target) SYNONYMS_MAPPING[String(r.input).toLowerCase().trim()] = String(r.target).toLowerCase().trim();
    }
    return SYNONYMS_MAPPING;
  } catch (e) {
    SYNONYMS_MAPPING = {};
    return {};
  }
}

async function tokenizeWithPython(text) {
  if (!TOKENIZER_URL) return null;
  let urlObj;
  try { urlObj = new URL(TOKENIZER_URL); } catch (err) { return null; }
  const payload = JSON.stringify({ text });
  const client = urlObj.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve) => {
    const req = client.request({ hostname: urlObj.hostname, port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80), path: urlObj.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { try { const json = JSON.parse(data || '{}'); const tokens = Array.isArray(json.tokens) ? json.tokens : []; const cleaned = tokens.map((t) => String(t || '').trim()).filter(Boolean); resolve(cleaned); } catch (errParse) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

async function normalize(text, pool) {
  try {
    const t = String(text || '').toLowerCase().trim();
    const cleaned = t.replace(/[\p{P}\p{S}]/gu, ' ');
    const separated = cleaned.replace(/(\p{L})(\p{N})/gu, '$1 $2').replace(/(\p{N})(\p{L})/gu, '$1 $2');
    const stopwords = await getStopwordsSet(pool);
    const shortStopwords = Array.from(stopwords).filter((sw) => sw && sw.length <= 4);
    const sortedStopwords = Array.from(stopwords).sort((a, b) => b.length - a.length);

    const refineTokens = (tokens) => {
      const result = [];
      const queue = [...tokens];
      const seen = new Set();
      let loopCount = 0;
      while (queue.length > 0) {
        if (loopCount++ > 1000) break;
        const tok = queue.shift().trim();
        if (!tok || seen.has(tok)) continue;
        seen.add(tok);
        if (stopwords.has(tok)) continue;
        let splitPerformed = false;
        for (const sw of sortedStopwords) {
          if (!sw) continue;
          if (tok.includes(sw) && tok !== sw) {
            const parts = tok.split(sw).map((p) => p.trim()).filter(Boolean);
            if (parts.length > 0) queue.unshift(...parts);
            splitPerformed = true;
            break;
          }
        }
        if (!splitPerformed) result.push(tok);
      }
      return result;
    };

    const pythonTokens = await tokenizeWithPython(separated);
    if (pythonTokens && pythonTokens.length > 0) {
      const refined = refineTokens(pythonTokens);
      return resolveSynonyms(refined);
    }

    let segmented = separated;
    for (const sw of shortStopwords) segmented = segmented.split(sw).join(' ');
    const rawTokens = segmented.split(/\s+/).filter(Boolean);
    const tokens = [];
    for (const tok of rawTokens) {
      if (stopwords.has(tok)) continue;
      let stripped = tok;
      for (const sw of stopwords) {
        if (sw.length <= 2 && stripped.startsWith(sw) && stripped.length > sw.length) {
          stripped = stripped.slice(sw.length);
          break;
        }
      }
      if (stripped && !stopwords.has(stripped)) tokens.push(stripped);
    }
    const refined = refineTokens(tokens);
    return resolveSynonyms(refined);
  } catch (err) {
    return [String(text || '').trim()];
  }
}

function jaccardSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function overlapScore(aTokens, bTokens) {
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const x of aTokens) if (bSet.has(x)) overlap++;
  return overlap;
}

function semanticOverlapScore(queryTokens, targetTokens) {
  let totalScore = 0;
  for (const qToken of queryTokens) {
    let maxSimilarity = 0;
    for (const tToken of targetTokens) {
      const similarity = getSemanticSimilarity(qToken, tToken);
      if (similarity > maxSimilarity) maxSimilarity = similarity;
    }
    totalScore += maxSimilarity;
  }
  return totalScore;
}

async function rankCandidates(queryTokens, candidates, pool) {
  const results = [];
  for (const item of candidates) {
    const kwTokens = await normalize((item.keywords || []).join(' '), pool);
    const qTextTokens = await normalize(item.QuestionText || '', pool);
    const titleTokens = await normalize(item.QuestionTitle || '', pool);
    // 🆕 Also normalize Category Name for scoring
    const catTokens = await normalize(item.CategoriesID || '', pool);

    const scoreOverlap = overlapScore(queryTokens, kwTokens) * 2;
    const scoreSemanticKw = semanticOverlapScore(queryTokens, kwTokens) * 2.5;
    const scoreSemanticText = semanticOverlapScore(queryTokens, qTextTokens) * 1.0;
    const scoreSemanticTitle = semanticOverlapScore(queryTokens, titleTokens) * 2.0;
    
    // 🆕 Score Category Name overlap (Huge boost if user types category name)
    const scoreCategory = overlapScore(queryTokens, catTokens) * 3.0;
    const scoreSemanticCategory = semanticOverlapScore(queryTokens, catTokens) * 2.5;

    const scoreSemantic = jaccardSimilarity(queryTokens, qTextTokens);
    const scoreTitle = jaccardSimilarity(queryTokens, titleTokens) * 2;
    
    const total = scoreOverlap + scoreSemantic + scoreTitle + scoreSemanticKw + scoreSemanticText + scoreSemanticTitle + scoreCategory + scoreSemanticCategory;
    
    results.push({ item, score: total, components: { overlap: scoreOverlap, semantic: scoreSemantic, title: scoreTitle, semanticKw: scoreSemanticKw, semanticText: scoreSemanticText, semanticTitle: scoreSemanticTitle, category: scoreCategory } });
  }
  return results.sort((a, b) => b.score - a.score);
}

// --------------------------------------------------------------------------------
// MAIN MODULE
// --------------------------------------------------------------------------------

module.exports = (pool) => async (req, res) => {
  if (req.body?.resetConversation) {
    if (!req.body?.message && !req.body?.text && !req.body?.id) return res.status(200).json({ success: true, reset: true });
  }

  // Load basic data
  try { await loadSemanticData(pool); } catch (e) {}
  try { await loadSynonymsMapping(pool); } catch (e) {}
  try { await NEG_KW_MODULE.loadNegativeKeywords(pool); } catch (e) {}
  
  const message = req.body?.message || req.body?.text || '';
  const questionId = req.body?.id;
  let rankingById = new Map();

  // 1. Handle Direct ID Request
  if (questionId) {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(`SELECT qa.QuestionsAnswersID, qa.QuestionTitle, qa.QuestionText, qa.ReviewDate, qa.OfficerID, c.CategoriesName AS CategoriesID, c.CategoriesPDF FROM QuestionsAnswers qa LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID WHERE qa.QuestionsAnswersID = ?`, [questionId]);
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
      const item = rows[0];
      return res.status(200).json({ success: true, found: true, answer: item.QuestionText, title: item.QuestionTitle, questionId: item.QuestionsAnswersID, categories: item.CategoriesID || null, categoriesPDF: item.CategoriesPDF || null });
    } catch (err) { return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' }); } finally { if (connection) connection.release(); }
  }

  if (!message || typeof message !== 'string') return res.status(400).json({ success: false, message: 'Invalid payload' });

  let connection;
  try {
    connection = await pool.getConnection();

    // 2. Fetch QA List FIRST (Moved up!)
    const qaList = await fetchQAWithKeywords(connection);
    if (!qaList || qaList.length === 0) return res.status(200).json({ success: true, found: false, message: 'ฐานข้อมูลยังไม่พร้อม', results: [] });

    // 3. Normalize Query
    let queryTokens = await normalize(message, pool);
    
    // 3.1 Check Empty Tokens
    if (!queryTokens || queryTokens.length === 0) {
        const { getDefaultContacts } = require('../../utils/getDefaultContact_fixed');
        const defaultContacts = await getDefaultContacts(connection);
        return res.status(200).json({ success: true, found: false, message: `ขออภัย ไม่เข้าใจคำถาม`, contacts: defaultContacts });
    }

    // 3.2 Check Strict No-Match (English Only or Unknown Keywords)
    const isEnglishOnly = /^[a-zA-Z0-9\s.,?!]+$/.test(message);
    const allKeywords = new Set();
    const allCategories = new Set(); // 🆕 Also check against Category Names
    
    for (const qa of qaList) {
        for (const k of (qa.keywords || [])) {
            allKeywords.add(String(k).toLowerCase().trim());
        }
        if (qa.CategoriesID) {
            allCategories.add(String(qa.CategoriesID).toLowerCase().trim());
        }
    }
    
    // 🆕 Check if query tokens match any keyword OR any category name token
    const hasKnownKeyword = queryTokens.some(t => {
        const token = String(t).toLowerCase().trim();
        if (allKeywords.has(token)) return true;
        // Check if token appears in any category name
        for (const cat of allCategories) {
            if (cat.includes(token)) return true;
        }
        return false;
    });

    if (!hasKnownKeyword || isEnglishOnly) {
        console.log(`❌ No valid keywords/categories found for query: "${message}"`);
        const { getDefaultContacts } = require('../../utils/getDefaultContact_fixed');
        try {
            const contacts = await getDefaultContacts(connection);
            return res.status(200).json({
                success: true,
                found: false,
                message: `😓 ขออภัยจริงๆ ฉันไม่มีข้อมูลเกี่ยวกับคำถามนี้`,
                contacts: contacts
            });
        } catch (e) {
            return res.status(200).json({ success: true, found: false, message: `😓 ขออภัยจริงๆ ฉันไม่มีข้อมูลเกี่ยวกับคำถามนี้`, contacts: [] });
        }
    }

    // 4. Ranking
    const ranked = await rankCandidates(queryTokens, qaList, pool);
    ranked.sort((a, b) => b.score - a.score);

    // 5. 🆕 START FIX: Strict Filtering Logic (Keyword Enforcer)
    let finalResults = ranked;
    
    if (ranked.length > 0) {
        const bestMatch = ranked[0];
        const bestScore = bestMatch.score;

        // 5.1 Basic Score Threshold (70%)
        if (bestScore > 5.0) { 
             finalResults = finalResults.filter(r => r.score >= (bestScore * 0.7)); 
        }

        // 5.2 Strict Keyword Enforcement
        // Find if the top result matches a "Specific Keyword" (> 4 chars, e.g., "การชำระเงินสมัครเรียน")
        const rawQuery = message.toLowerCase().replace(/\s+/g, '');
        const bestKeywords = (bestMatch.item.keywords || []).map(k => k.toLowerCase().replace(/\s+/g, ''));
        
        // Find a specific keyword from the top result that is also present in the user's query
        const specificTerm = bestKeywords.find(k => 
             rawQuery.includes(k) && 
             k.length > 4 && // Must be longer than 4 chars to be 'specific'
             !['สมัครเรียน', 'ข้อมูล', 'ติดต่อ', 'มหาวิทยาลัย'].includes(k) // Exclude generic words
        );

        if (specificTerm) {
             console.log(`🔒 Enforcing strict filter for term: "${specificTerm}"`);
             // Filter out any result that DOES NOT contain this specific term
             finalResults = finalResults.filter(r => {
                 const rKw = (r.item.keywords || []).map(k => k.toLowerCase().replace(/\s+/g, ''));
                 const rTitle = (r.item.QuestionTitle || '').toLowerCase().replace(/\s+/g, '');
                 
                 // Check if the result has the specific term in keywords or title
                 return rKw.some(k => k.includes(specificTerm) || specificTerm.includes(k)) || rTitle.includes(specificTerm);
             });
        }
    }
    // 🆕 END FIX

    // 6. Final Response
    if (finalResults.length === 0) {
        const { getDefaultContacts } = require('../../utils/getDefaultContact_fixed');
        try {
            const contacts = await getDefaultContacts(connection);
            return res.status(200).json({ success: true, found: false, message: `ไม่พบข้อมูลที่ตรงกัน`, contacts: contacts });
        } catch (e) {
            return res.status(200).json({ success: true, found: false, message: `ไม่พบข้อมูลที่ตรงกัน`, contacts: [] });
        }
    }

    const topRanked = finalResults.slice(0, 3);
    let specificContacts = [];
    try {
      const qaIds = topRanked.map(r => r.item.QuestionsAnswersID).filter(id => !!id);
      if (qaIds.length > 0) {
        // Query to fetch contacts for the specific answers found
        const [rows] = await connection.query(`
          SELECT DISTINCT org.OrgName AS organization, c.CategoriesName AS category, cc.Contact AS contact 
          FROM QuestionsAnswers qa 
          LEFT JOIN Officers o ON qa.OfficerID = o.OfficerID 
          LEFT JOIN Organizations org ON o.OrgID = org.OrgID 
          LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID 
          LEFT JOIN Categories_Contact cc ON (c.CategoriesID = cc.CategoriesID OR c.ParentCategoriesID = cc.CategoriesID) 
          WHERE qa.QuestionsAnswersID IN (?) AND ((cc.Contact IS NOT NULL AND TRIM(cc.Contact) <> '') OR (c.CategoriesID IS NULL)) 
          ORDER BY org.OrgID ASC, c.CategoriesName ASC`, [qaIds]);
        
        specificContacts = (rows || []).map(row => ({ 
            organization: row.organization, 
            category: row.category || null, 
            contact: row.contact || null 
        }));
      }
    } catch (e) { specificContacts = []; }

    const msgText = topRanked.length > 1 
      ? `✨ พบ ${topRanked.length} คำถามที่ใกล้เคียง\n(ลองเลือกซักอันดูสิ 😊)`
      : `✨ นี่คือคำตอบที่คุณหา`;

    return res.status(200).json({
      success: true,
      found: topRanked.length > 0,
      multipleResults: topRanked.length > 1,
      query: message,
      message: msgText,
      contacts: specificContacts,
      alternatives: topRanked.map(r => ({ id: r.item.QuestionsAnswersID, title: r.item.QuestionTitle, preview: (r.item.QuestionText || '').slice(0, 200), text: r.item.QuestionText, score: r.score.toFixed(2), keywords: r.item.keywords, categories: r.item.CategoriesID || null, categoriesPDF: r.item.CategoriesPDF || null }))
    });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด', detail: err.message });
  } finally {
    if (connection) connection.release();
  }
};