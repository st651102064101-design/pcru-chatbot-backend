/**
 * Fuzzy Matching Utilities
 * ใช้สำหรับจับคำที่พิมพ์ผิดเล็กน้อย เช่น "หอพก" → "หอพัก"
 */

/**
 * คำนวณ Levenshtein Distance (ระยะห่างระหว่างสองคำ)
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} จำนวนตัวอักษรที่ต้องแก้ไข
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * คำนวณความคล้ายคลึง (0-1, 1 = เหมือนกัน 100%)
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} similarity score 0-1
 */
function similarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * หาคำที่ใกล้เคียงที่สุดจาก list
 * @param {string} input - คำที่ user พิมพ์
 * @param {Array<string>} candidates - รายการคำที่เป็นไปได้
 * @param {number} threshold - ค่าต่ำสุดที่จะถือว่าใกล้เคียง (0-1) default 0.75
 * @returns {Object|null} { match: string, score: number } หรือ null ถ้าไม่มี
 */
function findClosestMatch(input, candidates, threshold = 0.75) {
  if (!input || !candidates || candidates.length === 0) return null;
  
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const score = similarity(input.toLowerCase(), candidate.toLowerCase());
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? { match: bestMatch, score: bestScore } : null;
}

/**
 * หาคำที่ใกล้เคียงทั้งหมดที่ผ่าน threshold
 * @param {string} input 
 * @param {Array<string>} candidates 
 * @param {number} threshold 
 * @returns {Array<{match: string, score: number}>} เรียงจากคะแนนสูงสุด
 */
function findAllMatches(input, candidates, threshold = 0.75) {
  if (!input || !candidates || candidates.length === 0) return [];
  
  const matches = [];
  
  for (const candidate of candidates) {
    const score = similarity(input.toLowerCase(), candidate.toLowerCase());
    if (score >= threshold) {
      matches.push({ match: candidate, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

module.exports = {
  levenshteinDistance,
  similarity,
  findClosestMatch,
  findAllMatches
};
