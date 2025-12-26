/**
 * Service to get stopwords from database
 * Returns a Set for easy lookup
 */
let cachedStopwords = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let lastStopwordsDBUpdate = 0; // timestamp in ms of last UpdatedAt from DB

const fs = require('fs');
const path = require('path');

const getWhitelist = () => {
  try {
    const p = path.join(__dirname, '..', '..', 'config', 'stopwords_whitelist.json');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const arr = JSON.parse(raw || '[]');
      return new Set((arr || []).map(s => String(s || '').toLowerCase().trim()).filter(Boolean));
    }
  } catch (e) {
    console.warn('⚠️  Could not load stopwords whitelist:', e && e.message);
  }
  return new Set();
};

const getStopwordsSet = async (pool) => {
  const now = Date.now();
  
  // Return cached version if still valid
  if (cachedStopwords && (now - lastCacheTime) < CACHE_DURATION) {
    // Check DB last update timestamp to ensure cache reflects manual DB edits
    try {
      const [rowsLast] = await pool.query(`SELECT UNIX_TIMESTAMP(MAX(UpdatedAt)) as last_unix FROM Stopwords`);
      const lastUnix = (rowsLast && rowsLast[0] && rowsLast[0].last_unix) ? Number(rowsLast[0].last_unix) : 0;
      const lastMs = lastUnix ? lastUnix * 1000 : 0;
      if (lastMs && lastMs > lastStopwordsDBUpdate) {
        // DB changed since we last loaded, invalidate cache and continue to reload
        cachedStopwords = null;
        lastCacheTime = 0;
      } else {
        return cachedStopwords;
      }
    } catch (e) {
      console.warn('⚠️  Could not verify Stopwords DB last update:', e && e.message);
      return cachedStopwords;
    }
  }

  console.log('🔄 Loading stopwords from database...');

  try {
    const [rows] = await pool.query(
      `SELECT StopwordText FROM Stopwords`
    );
    
    if (!rows || rows.length === 0) {
      console.error('❌ No stopwords found in database!');
      console.error('💡 Please run: mysql -u [user] -p [database] < database/update_stopwords_pythainlp.sql');
      throw new Error('Stopwords table is empty. Please run the migration script to populate it.');
    }
    
    const whitelist = getWhitelist();
    cachedStopwords = new Set(rows.map(r => String(r.StopwordText || '').toLowerCase()));
    // Remove any whitelisted words so they are NOT treated as stopwords
    for (const w of whitelist) {
      if (cachedStopwords.has(w)) cachedStopwords.delete(w);
    }

    // Auto-whitelist: exclude any term that already exists as a Keyword
    try {
      const [kws] = await pool.query(
        `SELECT DISTINCT KeywordText FROM Keywords WHERE KeywordText IS NOT NULL AND TRIM(KeywordText) <> ''`
      );
      let removed = 0;
      for (const row of (kws || [])) {
        const rawKw = String(row.KeywordText || '').trim();
        const kw = rawKw.toLowerCase();
        if (kw && cachedStopwords.has(kw)) {
          cachedStopwords.delete(kw);
          removed++;
          console.log(`  🛡️ Excluded keyword: "${rawKw}"`);
        }
      }
      if (removed > 0) {
        console.log(`🛡️ Auto-whitelist: excluded ${removed} keyword(s) from stopwords (based on Keywords table)`);
      } else {
        console.log(`ℹ️ Auto-whitelist: no keywords found in Keywords table or none matched stopwords`);
      }
    } catch (kwErr) {
      console.warn('⚠️  Could not auto-whitelist keywords from DB:', kwErr && kwErr.message);
    }
    lastCacheTime = now;
    // Update DB last update tracking
    try {
      const [rowsLast2] = await pool.query(`SELECT UNIX_TIMESTAMP(MAX(UpdatedAt)) as last_unix FROM Stopwords`);
      const lastUnix2 = (rowsLast2 && rowsLast2[0] && rowsLast2[0].last_unix) ? Number(rowsLast2[0].last_unix) : 0;
      lastStopwordsDBUpdate = lastUnix2 ? lastUnix2 * 1000 : now;
    } catch (e) {
      lastStopwordsDBUpdate = now;
    }
    
    console.log(`📝 Loaded ${cachedStopwords.size} stopwords from database`);
    return cachedStopwords;
  } catch (error) {
    console.error('❌ Error loading stopwords from database:', error.message);
    
    // Try to use pythainlp if installed (Node.js doesn't have pythainlp, but we can try external process)
    // For now, fail gracefully with empty set and log clear instructions
    console.error('⚠️  CRITICAL: Cannot load stopwords!');
    console.error('📋 Solutions:');
    console.error('   1. Run migration: mysql -u [user] -p [database] < database/update_stopwords_pythainlp.sql');
    console.error('   2. Or manually INSERT stopwords into Stopwords table');
    console.error('   3. System will continue WITHOUT stopword filtering (may affect search quality)');
    
    // Return empty set - system will work but without stopword filtering
    return new Set();
  }
};

// Function to clear cache (call this when stopwords are modified)
const clearStopwordsCache = () => {
  cachedStopwords = null;
  lastCacheTime = 0;
  console.log('🔄 Stopwords cache cleared');
};

module.exports = { getStopwordsSet, clearStopwordsCache };
