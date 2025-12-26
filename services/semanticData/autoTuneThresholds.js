// Auto-tune domain thresholds based on user feedback and query performance
// Analyzes chat logs, feedback, and click patterns to optimize DOMAIN_THRESHOLD dynamically

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '../../.env');
const TUNING_LOG_PATH = path.join(__dirname, '../../logs/threshold_tuning.json');

/**
 * Get current thresholds from .env
 */
function getCurrentThresholds() {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  const domainThreshold = parseFloat((envContent.match(/DOMAIN_THRESHOLD=([\d.]+)/) || [])[1]) || 0.40;
  const fallbackThreshold = parseFloat((envContent.match(/DOMAIN_FALLBACK_THRESHOLD=([\d.]+)/) || [])[1]) || 0.25;
  return { domainThreshold, fallbackThreshold };
}

/**
 * Update .env file with new thresholds
 */
function updateThresholds(newDomain, newFallback) {
  let envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent = envContent.replace(/DOMAIN_THRESHOLD=[\d.]+/, `DOMAIN_THRESHOLD=${newDomain.toFixed(2)}`);
  envContent = envContent.replace(/DOMAIN_FALLBACK_THRESHOLD=[\d.]+/, `DOMAIN_FALLBACK_THRESHOLD=${newFallback.toFixed(2)}`);
  fs.writeFileSync(ENV_PATH, envContent, 'utf8');
  console.log(`[autoTune] Updated thresholds: DOMAIN=${newDomain.toFixed(2)}, FALLBACK=${newFallback.toFixed(2)}`);
}

/**
 * Log tuning decisions for tracking
 */
function logTuning(reason, oldValues, newValues, metrics) {
  const logDir = path.dirname(TUNING_LOG_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  let history = [];
  if (fs.existsSync(TUNING_LOG_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(TUNING_LOG_PATH, 'utf8'));
    } catch (e) {
      history = [];
    }
  }
  
  history.push({
    timestamp: new Date().toISOString(),
    reason,
    oldValues,
    newValues,
    metrics
  });
  
  // Keep last 100 entries
  if (history.length > 100) {
    history = history.slice(-100);
  }
  
  fs.writeFileSync(TUNING_LOG_PATH, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Analyze feedback data and query patterns to determine if thresholds need adjustment
 */
async function analyzeAndTune(pool) {
  try {
    console.log('[autoTune] Starting threshold analysis...');
    
    const current = getCurrentThresholds();
    let newDomain = current.domainThreshold;
    let newFallback = current.fallbackThreshold;
    let needsUpdate = false;
    let reason = '';
    const metrics = {};

    // 1. Analyze repeated queries (same question asked multiple times = bot not answering well)
    const [repeatedQueries] = await pool.query(`
      SELECT 
        COUNT(DISTINCT LOWER(TRIM(UserQuery))) as uniqueQueries,
        COUNT(*) as totalQueries,
        SUM(CASE WHEN queryCounts.cnt > 2 THEN 1 ELSE 0 END) as repeatedCount
      FROM ChatLogHasAnswers
      LEFT JOIN (
        SELECT LOWER(TRIM(UserQuery)) as normQuery, COUNT(*) as cnt
        FROM ChatLogHasAnswers
        WHERE Timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY LOWER(TRIM(UserQuery))
      ) as queryCounts ON LOWER(TRIM(ChatLogHasAnswers.UserQuery)) = queryCounts.normQuery
      WHERE ChatLogHasAnswers.Timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    if (repeatedQueries && repeatedQueries[0]) {
      const { uniqueQueries, totalQueries, repeatedCount } = repeatedQueries[0];
      metrics.repeatedQueryRate = totalQueries > 0 ? (repeatedCount / totalQueries) : 0;
      metrics.uniqueQueries = uniqueQueries || 0;
      metrics.totalQueriesWithAnswers = totalQueries || 0;
      
      console.log('[autoTune] Query patterns:', metrics);
      
      // If many repeated queries (>30%) = users not satisfied with answers = increase threshold
      if (totalQueries >= 30 && metrics.repeatedQueryRate > 0.30) {
        newDomain = Math.min(0.60, current.domainThreshold + 0.04);
        newFallback = Math.min(0.40, current.fallbackThreshold + 0.03);
        needsUpdate = true;
        reason = 'High repeated query rate (>30%) - users asking same questions repeatedly, increasing threshold for better answers';
      }
      // If low repeated queries (<15%) = users satisfied, system working well
      else if (totalQueries >= 30 && metrics.repeatedQueryRate < 0.15) {
        // System is working well, no change needed
      }
    }

    // 2. Analyze negative feedback rate (last 7 days)
    const [feedbackRows] = await pool.query(`
      SELECT 
        SUM(CASE WHEN FeedbackValue = 0 THEN 1 ELSE 0 END) as negative,
        SUM(CASE WHEN FeedbackValue = 1 THEN 1 ELSE 0 END) as positive,
        COUNT(*) as total
      FROM Feedbacks
      WHERE Timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    if (feedbackRows && feedbackRows[0]) {
      const { negative, positive, total } = feedbackRows[0];
      metrics.negativeRate = total > 0 ? (negative / total) : 0;
      metrics.positiveRate = total > 0 ? (positive / total) : 0;
      metrics.totalFeedback = total;
      
      console.log('[autoTune] Feedback metrics:', metrics);
      
      // If negative feedback > 50% and we have enough data (>10 feedbacks)
      if (total >= 10 && metrics.negativeRate > 0.50) {
        // High negative feedback = results not relevant enough = increase threshold
        newDomain = Math.min(0.65, current.domainThreshold + 0.05);
        newFallback = Math.min(0.45, current.fallbackThreshold + 0.03);
        needsUpdate = true;
        reason = `High negative feedback rate (${(metrics.negativeRate*100).toFixed(1)}%) - increasing thresholds for stricter filtering`;
      }
      // If positive feedback > 70% and negative < 20%, we can relax a bit
      else if (total >= 10 && metrics.positiveRate > 0.70 && metrics.negativeRate < 0.20) {
        // Only relax if repeated query rate is low (users not re-asking)
        if (metrics.repeatedQueryRate < 0.20) {
          newDomain = Math.max(0.25, current.domainThreshold - 0.03);
          newFallback = Math.max(0.15, current.fallbackThreshold - 0.02);
          needsUpdate = true;
          reason = `High positive feedback (${(metrics.positiveRate*100).toFixed(1)}%) and low repeated-query rate - relaxing thresholds slightly`;
        }
      }
    }

    // 3. Analyze "no answer" logs (last 7 days)
    const [noAnswerRows] = await pool.query(`
      SELECT COUNT(*) as noAnswerCount
      FROM ChatLogNoAnswers
      WHERE Timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    const [hasAnswerRows] = await pool.query(`
      SELECT COUNT(*) as hasAnswerCount
      FROM ChatLogHasAnswers
      WHERE Timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    if (noAnswerRows && noAnswerRows[0] && hasAnswerRows && hasAnswerRows[0]) {
      const noAnswerCount = noAnswerRows[0].noAnswerCount || 0;
      const hasAnswerCount = hasAnswerRows[0].hasAnswerCount || 0;
      const totalQueries = noAnswerCount + hasAnswerCount;
      metrics.noAnswerRate = totalQueries > 0 ? (noAnswerCount / totalQueries) : 0;
      metrics.totalQueries = totalQueries;
      
      console.log('[autoTune] No-answer metrics:', { noAnswerCount, hasAnswerCount, noAnswerRate: metrics.noAnswerRate });
      
      // If no-answer rate > 30% and we have enough queries (>30)
      if (totalQueries >= 30 && metrics.noAnswerRate > 0.30) {
        // Too many queries getting no answer = threshold too strict = decrease
        newDomain = Math.max(0.25, current.domainThreshold - 0.05);
        newFallback = Math.max(0.15, current.fallbackThreshold - 0.03);
        needsUpdate = true;
        reason = 'High no-answer rate (>30%) - lowering thresholds to improve coverage';
      }
      // If no-answer rate < 10% but repeated query rate is high, threshold might be too loose
      else if (totalQueries >= 30 && metrics.noAnswerRate < 0.10 && metrics.repeatedQueryRate > 0.25) {
        newDomain = Math.min(0.55, current.domainThreshold + 0.03);
        newFallback = Math.min(0.35, current.fallbackThreshold + 0.02);
        needsUpdate = true;
        reason = 'Low no-answer rate but high repeated-query rate (>25%) - increasing threshold for more precise answers';
      }
    }

    // 4. Apply changes if needed
    if (needsUpdate) {
      console.log('[autoTune] Tuning decision:', {
        reason,
        old: current,
        new: { domainThreshold: newDomain, fallbackThreshold: newFallback },
        metrics
      });
      
      updateThresholds(newDomain, newFallback);
      logTuning(reason, current, { domainThreshold: newDomain, fallbackThreshold: newFallback }, metrics);
      
      console.log('[autoTune] ✅ Thresholds updated successfully. Changes will take effect on next server restart.');
      return { updated: true, reason, oldValues: current, newValues: { domainThreshold: newDomain, fallbackThreshold: newFallback } };
    } else {
      console.log('[autoTune] ℹ️  No tuning needed. Current thresholds are optimal based on recent data.');
      console.log('[autoTune] Metrics summary:', {
        repeatedQueryRate: ((metrics.repeatedQueryRate || 0) * 100).toFixed(1) + '%',
        noAnswerRate: ((metrics.noAnswerRate || 0) * 100).toFixed(1) + '%',
        negativeRate: ((metrics.negativeRate || 0) * 100).toFixed(1) + '%',
        positiveRate: ((metrics.positiveRate || 0) * 100).toFixed(1) + '%',
        uniqueQueries: metrics.uniqueQueries || 0,
        totalQueries: metrics.totalQueries || 0
      });
      return { updated: false, reason: 'Current thresholds are optimal', metrics };
    }
    
  } catch (error) {
    console.error('[autoTune] Error during threshold tuning:', error.message);
    return { updated: false, error: error.message };
  }
}

module.exports = { analyzeAndTune, getCurrentThresholds };
