function digitsOnly(s) {
  if (!s) return '';
  return String(s).replace(/[^0-9+]/g, '');
}

/**
 * Format common Thai phone numbers for display:
 * - mobile 10 digits (0xx xxx xxxx) -> 3-3-4
 * - landline 9 digits (0xx xxx xxx) -> 3-3-3
 * - if starts with country code 66, convert to 0...
 * - otherwise return cleaned digits
 */
function formatThaiPhone(raw) {
  if (!raw) return null;
  let d = digitsOnly(raw);
  // Convert +66 or 66 leading to 0
  if (d.startsWith('66') && d.length > 2) {
    d = '0' + d.slice(2);
  }
  if (d.length === 10 && d.startsWith('0')) {
    // mobile: 0xx-xxx-xxxx
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,10)}`;
  }
  if (d.length === 9 && d.startsWith('0')) {
    // landline: 0xx-xxx-xxx
    return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6,9)}`;
  }
  if (d.length === 8 && d.startsWith('2')) {
    // Bangkok old format without leading 0: 02-xxx-xxxx
    return `02-${d.slice(1,4)}-${d.slice(4,8)}`;
  }
  // Fallback: insert basic grouping for readability (after first digit and then every 4)
  if (d.length > 4) {
    return d.replace(/(\d{1,4})(\d{1,4})(\d{0,4})/, (m, a, b, c) => (c ? `${a}-${b}-${c}` : `${a}-${b}`));
  }
  return d;
}

module.exports = { formatThaiPhone, digitsOnly };
