const { formatThaiPhone } = require('./formatPhone');

/**
 * Retrieve default contact from DB based on configuration.
 * Priority:
 * 1) DEFAULT_CONTACT_OFFICER_ID (exact OfficerID)
 * 2) DEFAULT_CONTACT_OFFICER_NAME (partial match on officer name)
 * 3) DEFAULT_CONTACT_ORG_NAME (partial match on organization name)
 * If none configured, returns null (no hardcoded fallback).
 * @param {Pool} pool - mysql2/promise pool
 */
async function getDefaultContact(pool) {
  if (!pool) return null;

  const officerId = process.env.DEFAULT_CONTACT_OFFICER_ID ? String(process.env.DEFAULT_CONTACT_OFFICER_ID).trim() : null;
  const namePattern = process.env.DEFAULT_CONTACT_OFFICER_NAME ? String(process.env.DEFAULT_CONTACT_OFFICER_NAME).trim() : null;
  const orgPattern = process.env.DEFAULT_CONTACT_ORG_NAME ? String(process.env.DEFAULT_CONTACT_ORG_NAME).trim() : null;

  try {
    let rows = null;

    if (officerId) {
      const [r] = await pool.query(
        `SELECT o.OfficerPhone AS phone, o.OfficerName AS officer, org.OrgName AS organization
         FROM Officers o
         LEFT JOIN Organizations org ON o.OrgID = org.OrgID
         WHERE o.OfficerID = ? AND o.OfficerPhone IS NOT NULL AND TRIM(o.OfficerPhone) <> '' LIMIT 1`,
        [officerId]
      );
      rows = r;
    } else if (namePattern || orgPattern) {
      const nameLike = namePattern ? `%${namePattern}%` : null;
      const orgLike = orgPattern ? `%${orgPattern}%` : null;
      const [r] = await pool.query(
        `SELECT o.OfficerPhone AS phone, o.OfficerName AS officer, org.OrgName AS organization
         FROM Officers o
         LEFT JOIN Organizations org ON o.OrgID = org.OrgID
         WHERE (? IS NULL OR o.OfficerName LIKE ?) AND (? IS NULL OR org.OrgName LIKE ?) AND o.OfficerPhone IS NOT NULL LIMIT 1`,
        [nameLike, nameLike, orgLike, orgLike]
      );
      rows = r;
    } else {
      // No configured default; do not use hardcoded fallback
      return null;
    }

    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      organization: r.organization || null,
      officer: r.officer || null,
      phone: r.phone || null,
      officerPhoneRaw: r.phone || null,
      officerPhone: r.phone ? formatThaiPhone(r.phone) : null
    };
  } catch (e) {
    console.error('getDefaultContact failed:', e && (e.message || e));
    return null;
  }
}

module.exports = { getDefaultContact };
