// ✨ Enhanced respond.js with Word Embedding-like scoring
// เพิ่มการให้คะแนนตามความหมายที่ใกล้เคียง (Semantic Similarity)
// 📦 ดึงข้อมูลจาก Database แทน hardcode
// 🛡️ QUALITY GUARD: ป้องกัน chatbot ตอบมั่ว ตอบไม่ตรงคำถาม
// ⛔ NEGATIVE KEYWORDS: ดักจับประโยคปฏิเสธ (Look Backward Algorithm)

// (noKeywordMatches block removed — handled later in the normal response flow)

// --- Initialization helpers for semantic/synonym/negative keyword loaders ---
let SEMANTIC_SIM_MAP = {};
let getSemanticSimilarity = (a, b) => 0;
let SYNONYMS_MAPPING = {};

const { loadNegativeKeywords: _loadNegativeKeywords } = require('../negativeKeywords/loadNegativeKeywords');

async function loadNegativeKeywords(pool) {
  try {
    if (typeof _loadNegativeKeywords === 'function') return await _loadNegativeKeywords(pool);
    return {};
  } catch (e) {
    console.warn('loadNegativeKeywords wrapper failed:', e && (e.message || e));
    return {};
  }
}

// Ensure stopwords and negativeKeywords helpers are available
const { getStopwordsSet } = require('../stopwords/loadStopwords');
const NEG_KW = require('../negativeKeywords/loadNegativeKeywords');
const { simpleTokenize, analyzeQueryNegation, isNegativeKeyword, getNegativeModifier, checkNegation, getNegativeKeywordsMap, INLINE_NEGATION_PATTERNS, LOOK_BACKWARD_WINDOW } = NEG_KW;

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

// In-memory map for negation-related state (per-session)
const NEGATION_BLOCKS = new Map();

function getSessionKey(req) {
  try {
    if (!req) return 'anonymous';
    // Prefer express-session ID if present
    const sid = (req.session && (req.session.id || req.sessionID)) ? (req.session.id || req.sessionID) : null;
    if (sid) return String(sid);
    // Fallback to remote IP
    if (req.ip) return String(req.ip);
    return 'anonymous';
  } catch (e) { return 'anonymous'; }
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
      } catch (e) {
        return 0;
      }
    };
    return SEMANTIC_SIM_MAP;
  } catch (e) {
    console.warn('loadSemanticData: semantic loader not available or failed', e && (e.message || e));
    SEMANTIC_SIM_MAP = {};
    getSemanticSimilarity = () => 0;
    return {};
  }
}

async function loadSynonymsMapping(pool) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      `SELECT s.InputWord AS input, k.KeywordText AS target
       FROM KeywordSynonyms s
       JOIN Keywords k ON s.TargetKeywordID = k.KeywordID
       WHERE s.IsActive = 1`
    );
    connection.release();
    SYNONYMS_MAPPING = {};
    for (const r of rows || []) {
      if (r && r.input && r.target) SYNONYMS_MAPPING[String(r.input).toLowerCase().trim()] = String(r.target).toLowerCase().trim();
    }
    console.log('✅ Loaded', Object.keys(SYNONYMS_MAPPING).length, 'synonyms');
    return SYNONYMS_MAPPING;
  } catch (e) {
    console.warn('loadSynonymsMapping failed or not available:', e && (e.message || e));
    SYNONYMS_MAPPING = {};
    return {};
  }
}


async function normalize(text, pool) {
  try {
  const t = String(text || '').toLowerCase().trim();
  const cleaned = t.replace(/[\p{P}\p{S}]/gu, ' ');
  // Ensure separation between letters and numbers so tokens like "มี2.00" -> ["มี", "2", "00"]
  const separated = cleaned.replace(/(\p{L})(\p{N})/gu, '$1 $2').replace(/(\p{N})(\p{L})/gu, '$1 $2');
  const stopwords = await getStopwordsSet(pool);
  // Debugging: log basic info to help trace why 'มี' isn't removed
  try {
    console.log(`🔍 normalize input="${t}" separated="${separated}" stopwordsCount=${stopwords.size} hasมี=${stopwords.has('มี')}`);
  } catch (e) {
    // ignore logging errors
  }
  const shortStopwords = Array.from(stopwords).filter((sw) => sw && sw.length <= 4);
  // Sort stopwords by length descending to match longest possible stopword first (e.g., "อยากรู้" before "รู้")
  const sortedStopwords = Array.from(stopwords).sort((a, b) => b.length - a.length);

  const refineTokens = (tokens) => {
    const result = [];
    const queue = [...tokens]; // Use a queue to process tokens and their sub-parts
    const seen = new Set(); // Avoid infinite loops on weird splits
    let loopCount = 0;

    while (queue.length > 0) {
        if (loopCount++ > 1000) {
            console.warn('⚠️ refineTokens loop limit exceeded');
            break;
        }
        const tok = queue.shift().trim();
        if (!tok || seen.has(tok)) continue;
        seen.add(tok);

        // Check if the token itself is a stopword
        if (stopwords.has(tok)) {
            continue;
        }

        let splitPerformed = false;
        for (const sw of sortedStopwords) {
            if (!sw) continue;
            // Check if the token contains a short stopword but is not the stopword itself
            if (tok.includes(sw) && tok !== sw) {
                const parts = tok.split(sw).map((p) => p.trim()).filter(Boolean);
                if (parts.length > 0) {
                    // Add the new parts to the front of the queue to be processed again
                    queue.unshift(...parts);
                }
                splitPerformed = true;
                break; // Process one split at a time
            }
        }

        // If no split was performed, the token is considered final
        if (!splitPerformed) {
            result.push(tok);
        }
    }
    return result;
  };

  // Prefer PyThaiNLP tokenizer if service is available
  const pythonTokens = await tokenizeWithPython(separated);
  if (pythonTokens && pythonTokens.length > 0) {
    const refined = refineTokens(pythonTokens);
    return resolveSynonyms(refined); // 🆕 Resolve synonyms
  }

  // Heuristic segmentation fallback: split merged Thai text by short stopwords inside the string
  let segmented = separated;
  for (const sw of shortStopwords) {
    segmented = segmented.split(sw).join(' ');
  }

  const rawTokens = segmented.split(/\s+/).filter(Boolean);
  const tokens = [];

  for (const tok of rawTokens) {
    if (stopwords.has(tok)) continue;

    // Basic Thai prefix stripping for merged words (e.g., "หาทุน" -> "ทุน")
    let stripped = tok;
    for (const sw of stopwords) {
      if (sw.length <= 2 && stripped.startsWith(sw) && stripped.length > sw.length) {
        stripped = stripped.slice(sw.length);
        break;
      }
    }

    if (stripped && !stopwords.has(stripped)) {
      tokens.push(stripped);
    }
  }

  const refined = refineTokens(tokens);
  return resolveSynonyms(refined); // 🆕 Resolve synonyms
  } catch (err) {
    console.error('❌ Normalize error:', err);
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

/**
 * 🆕 Enhanced semantic overlap score using Word Embedding-like similarity
 * Similar to the document's "Word Embedding Scoring" approach
 */
function semanticOverlapScore(queryTokens, targetTokens) {
  let totalScore = 0;
  
  for (const qToken of queryTokens) {
    let maxSimilarity = 0;
    
    for (const tToken of targetTokens) {
      const similarity = getSemanticSimilarity(qToken, tToken);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }
    }
    
    totalScore += maxSimilarity;
  }
  
  return totalScore;
}

// Configurable similarity threshold for keyword matching (allows merged Thai tokens like "ดูทุน" ~ "ทุน")
const KW_SIM_THRESHOLD = parseFloat(process.env.KW_SIM_THRESHOLD) || 0.5; // was 0.7

// Optional PyThaiNLP tokenizer microservice (FastAPI)
const TOKENIZER_HOST = process.env.TOKENIZER_HOST || 'project.3bbddns.com';
const TOKENIZER_PORT = process.env.TOKENIZER_PORT || '36146';
const TOKENIZER_PATH = process.env.TOKENIZER_PATH || '/tokenize';
const TOKENIZER_URL = process.env.TOKENIZER_URL || `http://${TOKENIZER_HOST}:${TOKENIZER_PORT}${TOKENIZER_PATH}`;

async function tokenizeWithPython(text) {
  if (!TOKENIZER_URL) return null;

  let urlObj;
  try {
    urlObj = new URL(TOKENIZER_URL);
  } catch (err) {
    console.warn('Invalid TOKENIZER_URL:', err?.message || err);
    return null;
  }

  const payload = JSON.stringify({ text });
  const client = urlObj.protocol === 'https:' ? require('https') : require('http');

  return new Promise((resolve) => {
    const req = client.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            const tokens = Array.isArray(json.tokens) ? json.tokens : [];
            const cleaned = tokens.map((t) => String(t || '').trim()).filter(Boolean);
            resolve(cleaned);
          } catch (errParse) {
            console.error('Tokenizer service parse error:', errParse?.message || errParse);
            resolve(null);
          }
        });
      }
    );

    req.on('error', (errReq) => {
      console.warn('Tokenizer service unreachable:', errReq?.message || errReq);
      resolve(null);
    });

    req.on('timeout', () => {
      console.warn('Tokenizer service timeout');
      req.destroy();
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

async function fetchQAWithKeywords(connection) {
  const [rows] = await connection.query(
    `SELECT qa.QuestionsAnswersID, qa.QuestionTitle, qa.ReviewDate, qa.QuestionText, qa.OfficerID,
            c.CategoriesName AS CategoriesID, c.CategoriesPDF
     FROM QuestionsAnswers qa
     LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID`
  );

  const result = [];
  for (const row of rows) {
    const [keywords] = await connection.query(
      `SELECT k.KeywordText
       FROM Keywords k
       INNER JOIN AnswersKeywords ak ON k.KeywordID = ak.KeywordID
       WHERE ak.QuestionsAnswersID = ?`,
      [row.QuestionsAnswersID]
    );
    result.push({
      ...row,
      keywords: (keywords || []).map(k => k.KeywordText)
    });
  }
  return result;
}

/**
 * 🆕 Enhanced ranking with semantic similarity (like the document)
 */
async function rankCandidates(queryTokens, candidates, pool) {
  const results = [];
  
  for (const item of candidates) {
    const kwTokens = await normalize((item.keywords || []).join(' '), pool);
    const qTextTokens = await normalize(item.QuestionText || '', pool);
    const titleTokens = await normalize(item.QuestionTitle || '', pool);
    
    // Traditional overlap
    const scoreOverlap = overlapScore(queryTokens, kwTokens) * 2;
    
    // 🆕 Semantic overlap (Word Embedding-like)
    const scoreSemanticKw = semanticOverlapScore(queryTokens, kwTokens) * 2.5;
    const scoreSemanticText = semanticOverlapScore(queryTokens, qTextTokens) * 1.0;
    const scoreSemanticTitle = semanticOverlapScore(queryTokens, titleTokens) * 2.0;
    
    // Jaccard similarity
    const scoreSemantic = jaccardSimilarity(queryTokens, qTextTokens);
    const scoreTitle = jaccardSimilarity(queryTokens, titleTokens) * 2;
    
    // Combined score with semantic boost
    const total = scoreOverlap + scoreSemantic + scoreTitle + 
                  scoreSemanticKw + scoreSemanticText + scoreSemanticTitle;
    
    results.push({ 
      item, 
      score: total, 
      components: { 
        overlap: scoreOverlap, 
        semantic: scoreSemantic, 
        title: scoreTitle,
        semanticKw: scoreSemanticKw,
        semanticText: scoreSemanticText,
        semanticTitle: scoreSemanticTitle
      } 
    });
  }
  
  return results.sort((a, b) => b.score - a.score);
}

module.exports = (pool) => async (req, res) => {
  // Allow frontend to clear conversation (e.g., trash button)
  if (req.body?.resetConversation) {
    clearBlockedDomains(req);
    // If this is only a reset call, acknowledge immediately to avoid 400
    if (!req.body?.message && !req.body?.text && !req.body?.id) {
      return res.status(200).json({ success: true, reset: true });
    }
  }

  // Load semantic data, synonyms, and negative keywords from database at start of each request
  try {
    await loadSemanticData(pool);
  } catch (e) {
    console.warn('loadSemanticData error (continuing):', e && (e.message || e));
  }

  try {
    await loadSynonymsMapping(pool); // 🆕 Load synonym mappings
  } catch (e) {
    console.warn('loadSynonymsMapping error (continuing):', e && (e.message || e));
  }

  try {
    await loadNegativeKeywords(pool); // ⛔ Load negative keywords
  } catch (e) {
    console.warn('loadNegativeKeywords error (continuing):', e && (e.message || e));
  }
  
  const message = req.body?.message || req.body?.text || '';
  const questionId = req.body?.id;
  let rankingById = new Map();

  // Direct answer by ID
  if (questionId) {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT qa.QuestionsAnswersID, qa.QuestionTitle, qa.QuestionText, qa.ReviewDate, qa.OfficerID,
                c.CategoriesName AS CategoriesID, c.CategoriesPDF
         FROM QuestionsAnswers qa
         LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID
         WHERE qa.QuestionsAnswersID = ?`,
        [questionId]
      );
      
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: '😕 ไม่เจออย่างนั้นเหรอ ลองดูเลขที่ใหม่ดึก' });
      }

      const item = rows[0];
      return res.status(200).json({
        success: true,
        found: true,
        answer: item.QuestionText,
        title: item.QuestionTitle,
        questionId: item.QuestionsAnswersID,
        categories: item.CategoriesID || null,
        categoriesPDF: item.CategoriesPDF || null
      });
    } catch (err) {
      console.error('chat/respond (by ID) error:', err && (err.message || err));
      return res.status(500).json({ success: false, message: '😭 อุ๊ะ มีปัญหาเล็กน้อยเกิดขึ้น ลองใหม่ดูนะ' });
    } finally {
      if (connection) connection.release();
    }
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid payload: expected {message: string} or {id: number}' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    // Helper: split phone text into multiple phone entries (e.g., "056-717-119 หรือ 056-717-100 ต่อ 1121, 1122")
    const parsePhones = (raw) => {
      if (!raw) return [];
      return String(raw).split(/(?:หรือ|,|;|\/|\||\n)/i).map(p => p.trim()).filter(Boolean);
    };
    let queryTokens = await normalize(message, pool);
    // If normalization removed all tokens (e.g., the query was only stopwords),
    // treat as no-answer and return fallback contact info instead of ranking.
    if (!queryTokens || queryTokens.length === 0) {
      try {
        const { getDefaultContacts } = require('../../utils/getDefaultContact_fixed');
        const defaultContacts = await getDefaultContacts(connection);
        return res.status(200).json({
          success: true,
          found: false,
          message: `😓 ขออภัยจริงๆ ฉันไม่มีข้อมูลเกี่ยวกับคำถามนี้`,
          contacts: defaultContacts
        });
      } catch (e) {
        console.error('Error returning early fallback for empty tokens:', e && e.message);
        return res.status(200).json({ success: true, found: false, message: 'ขออภัย ระบบไม่พบคำตอบที่ตรงกับคำถามนี้', results: [] });
      }
    }
    
    // ⛔ Capture original tokens (before stopword removal) for negation detection
    const originalTokens = simpleTokenize(message);
    const negationAnalysis = analyzeQueryNegation(originalTokens, queryTokens);
    const blockedDomainsFromSession = loadBlockedDomains(req);
    const hadBlockedDomains = blockedDomainsFromSession.size > 0;
    const blockedKeywordsFromSession = loadBlockedKeywords(req);

    // � Log current session blocked state
    if (blockedKeywordsFromSession.size > 0 || blockedDomainsFromSession.size > 0) {
      console.log(`📊 Session state - Blocked keywords: [${Array.from(blockedKeywordsFromSession).join(', ')}], Blocked domains: [${Array.from(blockedDomainsFromSession).join(', ')}]`);
    }

    // �🔒 EARLY CHECK: If user's query exactly matches or contains a blocked keyword, reject early
    // Formula: คำปฏิเสธ - (คำพร้อง+คำสำคัญ) = keyword ถูกปฏิเสธ
    // User ถาม keyword ที่ถูก block → ต้องไม่แสดง
    if (blockedKeywordsFromSession.size > 0) {
      const msgLowerForBlock = message.toLowerCase().trim();
      let matchedBlockedKeyword = null;
      
      // Check if query exactly matches any blocked keyword
      for (const blocked of blockedKeywordsFromSession) {
        // Exact match
        if (msgLowerForBlock === blocked) {
          matchedBlockedKeyword = blocked;
          break;
        }
        // Query contains the blocked keyword (but not with negation prefix)
        // Only block if the query IS the keyword, not just contains it
        // e.g., "ทุนเรียนดี" blocked → "ทุนเรียนดี" query = blocked
        // But "ทุน" query should still show other scholarships
      }
      
      if (matchedBlockedKeyword) {
        console.log(`🚫 Query "${message}" directly asks for blocked keyword "${matchedBlockedKeyword}" - rejecting early`);
        return res.status(200).json({
          success: true,
          found: false,
          message: `${BOT_PRONOUN}ได้ปิดเรื่อง "${matchedBlockedKeyword}" ไว้แล้วค่ะ ถ้าต้องการดูเรื่องนี้อีกครั้ง กดรีเซ็ต (ถังขยะ) แล้วลองใหม่ได้นะคะ 😊`,
          blockedDomains: Array.from(blockedDomainsFromSession),
          blockedKeywords: Array.from(blockedKeywordsFromSession),
          blockedKeywordsDisplay: [matchedBlockedKeyword]
        });
      }
    }

    // Negative keywords must come from DB list only
    const negMap = getNegativeKeywordsMap && getNegativeKeywordsMap();
    const negationWordsSet = new Set();
    if (negMap && typeof negMap === 'object') {
      Object.keys(negMap).forEach(w => {
        const cleaned = String(w || '').trim().toLowerCase();
        if (cleaned) negationWordsSet.add(cleaned);
      });
    }

    // Track whether any valid negation trigger was detected
    let hasNegationTrigger = false;

    // 🆕 Extract negated keywords directly from the message
    // Pattern: ไม่เอา/ไม่ต้อง/ไม่อยาก + keyword
    const negatedKeywordsFromMessage = [];
    const negatedKeywordsDisplayMap = new Map(); // cleaned -> original text for display
    // Build prefixes dynamically from DB negative keywords + inline patterns (longest first)
    const buildNegationPrefixes = () => {
      const set = new Set();
      negationWordsSet.forEach(w => set.add(w));
      if (Array.isArray(INLINE_NEGATION_PATTERNS)) {
        INLINE_NEGATION_PATTERNS.forEach(p => {
          const cleaned = String(p.word || '').trim().toLowerCase();
          if (cleaned && negationWordsSet.has(cleaned)) set.add(cleaned);
        });
      }
      // Sort longest first to match the most specific phrase first
      return Array.from(set).sort((a, b) => b.length - a.length);
    };
    const negationPrefixes = buildNegationPrefixes();
    const msgLower = message.toLowerCase();
    
    // Words that are part of negation phrases and should NOT be treated as keywords
    // Pull from DB (NegativeKeywords) + inline patterns to avoid hardcoding
    const buildNegationPartWords = () => {
      const set = new Set();
      negationWordsSet.forEach(w => set.add(w));
      if (Array.isArray(INLINE_NEGATION_PATTERNS)) {
        INLINE_NEGATION_PATTERNS.forEach(p => {
          const cleaned = String(p.word || '').trim().toLowerCase();
          if (cleaned && negationWordsSet.has(cleaned)) set.add(cleaned);
        });
      }
      return set;
    };
    const negationPartWords = buildNegationPartWords();
    const isNegationPart = (word) => negationPartWords.has(String(word || '').toLowerCase());
    
    // Track which parts of message we've already extracted to avoid duplicates
    let alreadyExtracted = new Set();
    
    const addNegatedKeyword = (cleaned, originalDisplay) => {
      // Skip very short tokens to avoid blocking generic words (e.g., "ทุน", "หอ")
      if (!cleaned || cleaned.length < 3) return;
      if (isNegationPart(cleaned)) return;
      if (alreadyExtracted.has(cleaned)) return;
      const displayText = (originalDisplay && Array.from(negationPartWords).some(p => originalDisplay.startsWith(p)))
        ? cleaned
        : (originalDisplay || cleaned);
      negatedKeywordsFromMessage.push(cleaned);
      negatedKeywordsDisplayMap.set(cleaned, displayText);
      alreadyExtracted.add(cleaned);
    };

    for (const prefix of negationPrefixes) {
      const prefixIdx = msgLower.indexOf(prefix);
      if (prefixIdx !== -1) {
        // Extract what comes after the negation prefix
        hasNegationTrigger = true;
        let afterPrefix = msgLower.slice(prefixIdx + prefix.length).trim();
        
        if (afterPrefix.length > 0) {
          // Take the first meaningful word/phrase (up to space or end)
          let firstWord = afterPrefix.split(/[\s,.:;!?]+/)[0];
          const originalWord = firstWord;
          
          // Remove leading negation part words (e.g., "เอาอยากจีบ" → "อยากจีบ" → "จีบ")
          let cleaned = firstWord;
          for (const partWord of negationPartWords) {
            if (cleaned.startsWith(partWord) && cleaned.length > partWord.length) {
              cleaned = cleaned.slice(partWord.length);
            }
          }
          // Do another pass in case there are nested parts (e.g., "เอาอยาก" → "อยาก" → "")
          for (const partWord of negationPartWords) {
            if (cleaned.startsWith(partWord) && cleaned.length > partWord.length) {
              cleaned = cleaned.slice(partWord.length);
            }
          }
          firstWord = cleaned;
          
          if (firstWord && firstWord.length >= 2 && !alreadyExtracted.has(firstWord) && !isNegationPart(firstWord)) {
            addNegatedKeyword(firstWord, originalWord);
          }
        }
        // Only process the longest (most specific) negation prefix
        break;
      }
    }

    // Collect negated domains from analysis and inline fallback (e.g., "ไม่เอาทุน" in one token)
    const negatedDomains = [];
    if (negationAnalysis.hasNegation) {
      console.log(`⛔ Negation detected in query "${message}":`, negationAnalysis.negatedKeywords.map(n => `${n.negativeWord} → ${n.keyword}`).join(', '));
      for (const n of negationAnalysis.negatedKeywords) {
        const negWord = String(n.negativeWord || '').toLowerCase();
        if (!negationWordsSet.has(negWord)) continue;
        hasNegationTrigger = true;
        let kw = String(n.keyword || '').toLowerCase();
        
        // Smart extraction: if this keyword CONTAINS an already-extracted keyword, use the extracted one
        let bestMatch = null;
        for (const extracted of alreadyExtracted) {
          if (kw.includes(extracted) && extracted.length >= 2) {
            // If multiple matches, prefer the longest
            if (!bestMatch || extracted.length > bestMatch.length) {
              bestMatch = extracted;
            }
          }
        }
        
        if (bestMatch) {
          // Use the already-extracted version
          kw = bestMatch;
        } else {
          // Apply standard prefix stripping
          // Remove negation part words from beginning
          for (const partWord of negationPartWords) {
            if (kw.startsWith(partWord) && kw.length > partWord.length) {
              kw = kw.slice(partWord.length);
            }
          }
          // Second pass
          for (const partWord of negationPartWords) {
            if (kw.startsWith(partWord) && kw.length > partWord.length) {
              kw = kw.slice(partWord.length);
            }
          }
        }
        
        // Add to negated keywords list (avoid duplicates and negation parts)
        // Skip if this cleaned keyword was already added from earlier prefix processing
        if (kw.length >= 2) {
          addNegatedKeyword(kw, n.keyword || kw);
        }
        // Also check for domain blocks
        // Block specific keyword only; do not block entire scholarship domain when user negates a specific scholarship keyword
        if (kw.includes('หอ')) negatedDomains.push('dorm');
        if (kw.includes('รับสมัคร') || kw.includes('สมัคร')) negatedDomains.push('admissions');
      }
    }
    // Fallback inline detection for combined tokens like "ไม่เอาทุน" or "ไม่อยากสมัคร"
    const domainChecks = [
      { term: 'หอ', domain: 'dorm' },
      { term: 'รับสมัคร', domain: 'admissions' },
      { term: 'สมัคร', domain: 'admissions' },
    ];
    for (const check of domainChecks) {
      const neg = checkNegation(originalTokens, check.term);
      const negWord = String(neg.negativeWord || '').toLowerCase();
      if (neg.isNegated && negationWordsSet.has(negWord) && !negatedDomains.includes(check.domain)) {
        negatedDomains.push(check.domain);
        hasNegationTrigger = true;
        console.log(`⛔ Domain "${check.domain}" blocked due to negation: "${neg.negativeWord}" before "${check.term}"`);
      }
    }
    
    // 🆕 If we found negated keywords, persist them and respond
    const uniqueNegatedKeywords = [...new Set(negatedKeywordsFromMessage)].filter(k => k && k.length >= 2);
    // Validate and pick longest-matching DB keywords present in the user message
    let filteredNegatedKeywords = uniqueNegatedKeywords;
    try {
      const [kwRows] = await connection.query('SELECT LOWER(KeywordText) AS kw FROM Keywords');
      const kwList = (kwRows || []).map(r => (r.kw || '').trim()).filter(Boolean);
      const msgLower = String(message || '').toLowerCase();
      // Find DB keywords that appear in the message
      const matched = kwList.filter(kw => kw && msgLower.includes(kw));
      // Keep longest, drop shorter ones that are substrings of kept ones
      matched.sort((a, b) => b.length - a.length);
      const longestOnly = [];
      for (const kw of matched) {
        if (longestOnly.some(k => k.includes(kw))) continue; // skip shorter overlapping
        longestOnly.push(kw);
      }
      filteredNegatedKeywords = longestOnly.length > 0
        ? longestOnly
        : uniqueNegatedKeywords.filter(kw => kwList.includes(kw));
    } catch (e) {
      console.warn('Negated keyword validation failed, using raw list:', e && e.message);
    }

    if (hasNegationTrigger && (filteredNegatedKeywords.length > 0 || negatedDomains.length > 0)) {
      if (filteredNegatedKeywords.length > 0) {
        persistBlockedKeywords(req, filteredNegatedKeywords);
        console.log(`⛔ Blocked keywords: [${filteredNegatedKeywords.join(', ')}]`);
      }
      if (negatedDomains.length > 0) {
        persistBlockedDomains(req, negatedDomains);
      }
      // If we only blocked keywords (no domain intent), ensure scholarship domain is not blocked.
      if (negatedDomains.length === 0 && filteredNegatedKeywords.length > 0) {
        const key = getSessionKey(req);
        const entry = NEGATION_BLOCKS.get(key);
        if (entry) {
          NEGATION_BLOCKS.set(key, {
            ...entry,
            blockedDomains: new Set(),
            updatedAt: Date.now(),
          });
        }
        console.log('🔧 Domain blocks after keyword-only block:', Array.from(loadBlockedDomains(req)));
      }
      
      // Build response message
      const domainThaiNames = {
        scholarship: 'เรื่องทุน',
        dorm: 'เรื่องหอพัก',
        admissions: 'เรื่องการรับสมัคร',
      };
      const blockedItems = [];
      // If a keyword already covers a domain term, skip adding the domain to keep message specific
      const hasScholarshipKw = filteredNegatedKeywords.some(kw => kw.includes('ทุน'));
      const hasDormKw = filteredNegatedKeywords.some(kw => kw.includes('หอ'));
      const hasAdmissionsKw = filteredNegatedKeywords.some(kw => kw.includes('สมัคร') || kw.includes('รับสมัคร'));

      negatedDomains.forEach(d => {
        if (d === 'scholarship' && hasScholarshipKw) return;
        if (d === 'dorm' && hasDormKw) return;
        if (d === 'admissions' && hasAdmissionsKw) return;
        blockedItems.push(domainThaiNames[d] || d);
      });

      // Add keyword-specific blocks
      filteredNegatedKeywords.forEach(kw => {
        const display = negatedKeywordsDisplayMap.get(kw) || kw;
        blockedItems.push(`เรื่อง "${display}"`);
      });
      
      const blockedNames = blockedItems.length > 0 ? blockedItems.join(', ') : 'หัวข้อที่คุณปฏิเสธ';
      
      // Short-circuit response to clearly acknowledge the block action
      return res.status(200).json({
        success: true,
        found: false,
        message: `รับทราบค่ะ ${BOT_PRONOUN}จะไม่แนะนำ${blockedNames}แล้วนะคะ มีอะไรอื่นให้ช่วยไหมคะ? 😊`,
        blockedDomains: Array.from(loadBlockedDomains(req)),
        blockedKeywords: Array.from(loadBlockedKeywords(req)),
        blockedKeywordsDisplay: uniqueNegatedKeywords.map(kw => negatedKeywordsDisplayMap.get(kw) || kw)
      });
    }
    
    // Thai word patterns disabled
    const KNOWN_THAI_WORDS = [];
    
    const smartTokenize = (tokens) => {
      const result = [];
      for (const token of tokens) {
        if (token.length <= 4) {
          result.push(token);
          continue;
        }
        
        // Try to split compound Thai words
        let remaining = token;
        const parts = [];
        let splitOccurred = false;
        
        while (remaining.length > 0) {
          let found = false;
          for (const word of KNOWN_THAI_WORDS) {
            if (remaining.startsWith(word)) {
              parts.push(word);
              remaining = remaining.substring(word.length);
              found = true;
              splitOccurred = true;
              break;
            }
          }
          if (!found) {
            // No known word at start, try to find one inside
            let foundInside = false;
            for (const word of KNOWN_THAI_WORDS) {
              const idx = remaining.indexOf(word);
              if (idx > 0 && idx < remaining.length) {
                // Found word inside, split at that position
                const before = remaining.substring(0, idx);
                if (before.length >= 2) parts.push(before);
                parts.push(word);
                remaining = remaining.substring(idx + word.length);
                foundInside = true;
                splitOccurred = true;
                break;
              }
            }
            if (!foundInside) {
              // No split possible, keep remaining as is
              if (remaining.length >= 2) parts.push(remaining);
              break;
            }
          }
        }
        
        if (splitOccurred && parts.length > 0) {
          result.push(...parts);
        } else {
          result.push(token);
        }
      }
      return result.filter(t => t && t.length >= 2);
    };
    
    const tokensBefore = [...queryTokens];
    queryTokens = smartTokenize(queryTokens);
    if (JSON.stringify(tokensBefore) !== JSON.stringify(queryTokens)) {
      console.log(`🔧 Smart tokenizer: [${tokensBefore.join(', ')}] → [${queryTokens.join(', ')}]`);
    }

    const qaList = await fetchQAWithKeywords(connection);
    if (!qaList || qaList.length === 0) {
      return res.status(200).json({
        success: true,
        found: false,
        message: '😊 ดูเหมือนว่าฐานข้อมูลของเรายังไม่พร้อมเลย หรือลองไปดูเวลาอื่นนะ',
        results: []
      });
    }

    const ranked = await rankCandidates(queryTokens, qaList, pool);
    ranked.sort((a, b) => b.score - a.score);

    // 🆕 START FIX: กรองผลลัพธ์ (Strict Filtering V3)
    let finalResults = ranked;
    if (ranked.length > 0) {
        const bestMatch = ranked[0];
        const bestScore = bestMatch.score;

        // 3.1 กรองด้วยคะแนนสัมพัทธ์ (Relative Threshold)
        if (bestScore > 5.0) { 
             finalResults = finalResults.filter(r => r.score >= (bestScore * 0.7)); // เพิ่มเกณฑ์เป็น 70%
        }

        // 3.2 🆕 กฎเหล็ก: Keyword Specific Enforcement
        // หา "คำสำคัญเฉพาะ" (Specific Terms) จากคำตอบอันดับ 1
        // คำสำคัญคือคำที่ยาว > 4 ตัวอักษร และไม่ใช่คำทั่วไป
        const rawQuery = message.toLowerCase().replace(/\s+/g, '');
        const bestKeywords = (bestMatch.item.keywords || []).map(k => k.toLowerCase().replace(/\s+/g, ''));
        // หาคำที่อยู่ใน Query และเป็น Keyword ของที่ 1 และยาวพอสมควร
        const specificTerm = bestKeywords.find(k => rawQuery.includes(k) && k.length > 4 && !['สมัครเรียน', 'ข้อมูล', 'ติดต่อ'].includes(k));

        if (specificTerm) {
             console.log(`🔒 Enforcing strict filter for term: "${specificTerm}"`);
             // บังคับ: คำตอบอื่นต้องมีคำนี้ด้วย (ใน keyword หรือ title)
             finalResults = finalResults.filter(r => {
                 const rKw = (r.item.keywords || []).map(k => k.toLowerCase().replace(/\s+/g, ''));
                 const rTitle = (r.item.QuestionTitle || '').toLowerCase().replace(/\s+/g, '');
                 // เช็คว่ามีคำสำคัญไหม
                 return rKw.some(k => k.includes(specificTerm)) || rTitle.includes(specificTerm);
             });
        }
    }
    // 🆕 END FIX

    // If after filtering no results, fall back to default contacts
    if (finalResults.length === 0) {
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

    // Return top results with semantic scoring
    const topRanked = finalResults.slice(0, 3);

    // 🆕 1. เตรียมดึงข้อมูล Contact เฉพาะของ 3 คำตอบนี้ (ทำก่อนส่ง Response)
    let specificContacts = [];
    try {
      // ดึง ID ของคำตอบทั้ง 3 ข้อ
      const qaIds = topRanked.map(r => r.item.QuestionsAnswersID).filter(id => !!id);

      if (qaIds.length > 0) {
        // 🆕 2. SQL Query: ดึง Organization -> Category -> Contact 
        // โดย Filter เฉพาะ QuestionsAnswersID ที่เราเจอ
        // 🔥 แก้ไข: เพิ่มเงื่อนไข JOIN ให้หาเบอร์จาก Parent Category ได้ด้วย (กรณีหมวดย่อยไม่มีเบอร์)
        const [rows] = await connection.query(`
          SELECT DISTINCT
              org.OrgName AS organization,
              c.CategoriesName AS category,
              cc.Contact AS contact
          FROM QuestionsAnswers qa
          LEFT JOIN Officers o ON qa.OfficerID = o.OfficerID
          LEFT JOIN Organizations org ON o.OrgID = org.OrgID
          LEFT JOIN Categories c ON qa.CategoriesID = c.CategoriesID
          -- 🔥 JOIN แบบยืดหยุ่น: หา contact จากหมวดตัวเอง หรือ หมวดแม่
          LEFT JOIN Categories_Contact cc ON (c.CategoriesID = cc.CategoriesID OR c.ParentCategoriesID = cc.CategoriesID)
          WHERE 
              qa.QuestionsAnswersID IN (?)
              AND cc.Contact IS NOT NULL AND TRIM(cc.Contact) <> ''
          ORDER BY 
              org.OrgID ASC,
              c.CategoriesName ASC
        `, [qaIds]); // ส่ง array ของ IDs เข้าไปตรงๆ

        // 🆕 3. Map ข้อมูลให้ตรง Format ที่ Frontend (Vue.js) รอรับ
        specificContacts = (rows || []).map(row => ({
          organization: row.organization,
          category: row.category || null, // ส่ง null ถ้าไม่มีค่า (Frontend จะจัดการแสดงผลเอง)
          contact: row.contact || null    // ส่ง null ถ้าไม่มีค่า
        }));
      }
    } catch (e) {
      console.error('Error fetching specific contacts:', e && e.message);
      // ถ้า Error ให้เป็น array ว่าง หรือใส่ Default ตามต้องการ
      specificContacts = []; 
    }

    // 🆕 4. ส่ง Response กลับไป
    return res.status(200).json({
      success: true,
      found: topRanked.length > 0,
      multipleResults: topRanked.length > 1,
      query: message,
      message: topRanked.length > 0 
        ? `✨ พบ ${topRanked.length} คำถามที่ใกล้เคียง\n(ลองเลือกซักอันดูสิ 😊)`
        : `😓 ขออภัยจริงๆ ฉันไม่มีข้อมูลเกี่ยวกับคำถามนี้`,
      
      contacts: specificContacts, // ✅ ใส่ตัวแปรที่เราเตรียมไว้ตรงนี้

      alternatives: topRanked.map(r => ({
        id: r.item.QuestionsAnswersID,
        title: r.item.QuestionTitle,
        preview: (r.item.QuestionText || '').slice(0, 200),
        text: r.item.QuestionText,
        score: r.score.toFixed(2),
        semanticScore: (r.components.semanticKw + r.components.semanticText + r.components.semanticTitle).toFixed(2),
        keywords: r.item.keywords,
        categories: r.item.CategoriesID || null,
        categoriesPDF: r.item.CategoriesPDF || null,
        finalRanking: rankingById.get(r.item.QuestionsAnswersID) || null
      }))
    });
  } catch (err) {
    console.error('chat/respond error:', err && (err.message || err));
    if (err && err.stack) console.error(err.stack);
    const detail = err && err.stack ? String(err.stack).split('\n').slice(0,10).join('\n') : (err && err.message) || null;
    res.status(500).json({ success: false, message: '😭 อุ๊ะ มีปัญหาเล็กน้อยเกิดขึ้น ลองใหม่ดูนะ', detail });
  } finally {
    if (connection) connection.release();
  }
};
