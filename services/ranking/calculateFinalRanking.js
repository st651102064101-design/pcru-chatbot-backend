// Weighted Final Ranking calculation service
// Accepts an object of component scores and returns total and breakdown
// Example components: core, synonym_support, domain_support, application_support

const fs = require('fs');
const path = require('path');

/**
 * Load default weights from config file if present, otherwise use hardcoded defaults.
 */
function loadDefaultWeights() {
  try {
    const cfgPath = path.join(__dirname, '..', '..', 'config', 'ranking.json');
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        core: Number(parsed.core ?? 1.0),
        synonym_support: Number(parsed.synonym_support ?? 0.95),
        domain_support: Number(parsed.domain_support ?? 0.9),
        application_support: Number(parsed.application_support ?? 0.2),
      };
    }
  } catch (err) {
    console.error('Failed to load ranking config, using defaults:', err && err.message);
  }
  return { core: 1.0, synonym_support: 0.95, domain_support: 0.9, application_support: 0.2 };
}

const DEFAULT_WEIGHTS = loadDefaultWeights();

/**
 * Calculate final ranking with weights.
 * @param {Object} scores - component scores (0..1)
 * @param {Object} [weights] - optional override weights
 * @returns {{ total: number, breakdown: Record<string, number>, weights: Record<string, number> }}
 */
function calculateFinalRanking(scores, weights = {}, sampleText = '') {
  const defaultWeights = DEFAULT_WEIGHTS;
  const w = { ...defaultWeights, ...weights };

  // Normalize missing components to 0
  const s = {
    core: Number(scores.core || 0),
    synonym_support: Number(scores.synonym_support || 0),
    domain_support: Number(scores.domain_support || 0),
    application_support: Number(scores.application_support || 0),
  };

  // Clamp scores to [0,1]
  Object.keys(s).forEach((k) => {
    if (!Number.isFinite(s[k])) s[k] = 0;
    s[k] = Math.max(0, Math.min(1, s[k]));
  });

  // Simple text-based modifier: apply a penalty when negative words are present
  let textFactor = 1.0;
  const notes = [];
  if (typeof sampleText === 'string' && sampleText.trim()) {
    const t = sampleText.trim().toLowerCase();
    const negWords = ['ไม่', 'ห้าม', 'อย่า', 'ยกเว้น', 'ไม่เอา'];
    const hasNeg = negWords.some(wd => t.includes(wd));
    if (hasNeg) {
      textFactor = 0.85; // 15% penalty when negation is present
      notes.push('Applied negation penalty (text contains negative words)');
    }
  }

  const breakdown = {
    core: s.core * w.core * textFactor,
    synonym_support: s.synonym_support * w.synonym_support * textFactor,
    domain_support: s.domain_support * w.domain_support * textFactor,
    application_support: s.application_support * w.application_support * textFactor,
  };

  const total = Object.values(breakdown).reduce((acc, v) => acc + v, 0);

  return { total, breakdown, weights: w, textFactor, notes };
}

module.exports = { calculateFinalRanking, DEFAULT_WEIGHTS };
