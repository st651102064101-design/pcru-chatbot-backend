const express = require('express');
const router = express.Router();
const { calculateFinalRanking, DEFAULT_WEIGHTS } = require('../services/ranking/calculateFinalRanking');
const fs = require('fs');
const path = require('path');
const authenticateToken = require('../auth');

// POST /ranking/calculate
// Body: { scores: { core, synonym_support, domain_support, application_support }, weights?: { ... }, sampleText?: string }
router.post('/calculate', (req, res) => {
  try {
    const { scores = {}, weights = {}, sampleText = '' } = req.body || {};
    const result = calculateFinalRanking(scores, weights, sampleText);
    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(400).json({ ok: false, message: err.message || 'Ranking calculation failed' });
  }
});

// GET /ranking/weights - return current default weights (from config or defaults)
router.get('/weights', (req, res) => {
  try {
    return res.json({ ok: true, weights: DEFAULT_WEIGHTS });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Failed to read ranking weights' });
  }
});

// POST /ranking/weights - update default weights (protected)
router.post('/weights', authenticateToken, (req, res) => {
  try {
    const user = req.user || {};
    const role = user.usertype || user.role || null;
    // Only allow Officers or Admins to update weights
    if (!role || (role !== 'Officer' && role !== 'Admin' && role !== 'Super Admin')) {
      return res.status(403).json({ ok: false, message: 'Forbidden: insufficient privileges' });
    }

    const { core, synonym_support, domain_support, application_support } = req.body || {};
    const updated = {
      core: Number(core ?? DEFAULT_WEIGHTS.core),
      synonym_support: Number(synonym_support ?? DEFAULT_WEIGHTS.synonym_support),
      domain_support: Number(domain_support ?? DEFAULT_WEIGHTS.domain_support),
      application_support: Number(application_support ?? DEFAULT_WEIGHTS.application_support),
    };

    const cfgPath = path.join(__dirname, '..', 'config', 'ranking.json');
    fs.writeFileSync(cfgPath, JSON.stringify(updated, null, 2), 'utf8');

    // Update in-memory DEFAULT_WEIGHTS exported by calculateFinalRanking module so GET /ranking/weights reflects change without restart
    try {
      const rankingService = require('../services/ranking/calculateFinalRanking');
      if (rankingService && rankingService.DEFAULT_WEIGHTS) {
        // mutate properties so reference stays same
        rankingService.DEFAULT_WEIGHTS.core = updated.core;
        rankingService.DEFAULT_WEIGHTS.synonym_support = updated.synonym_support;
        rankingService.DEFAULT_WEIGHTS.domain_support = updated.domain_support;
        rankingService.DEFAULT_WEIGHTS.application_support = updated.application_support;
      }
    } catch (e) {
      console.warn('Could not update in-memory DEFAULT_WEIGHTS:', e && e.message);
    }

    return res.json({ ok: true, weights: updated });
  } catch (err) {
    console.error('Failed to update ranking weights:', err && err.message);
    return res.status(500).json({ ok: false, message: 'Failed to update ranking weights' });
  }
});

module.exports = router;
