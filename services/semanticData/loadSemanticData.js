// loadSemanticData.js - Simplified version without SemanticSimilarity, ThaiWordPatterns, etc.
// All semantic learning features removed

/**
 * Placeholder for future semantic data loading if needed
 */
const getSemanticSimilarity = async (pool) => {
  // Return empty object - semantic similarity feature removed
  return {};
};

/**
 * Clear cache (no-op now)
 */
const clearSemanticCache = () => {
  console.log('🔄 Semantic cache cleared (all features disabled)');
};

module.exports = {
  getSemanticSimilarity,
  clearSemanticCache
};
