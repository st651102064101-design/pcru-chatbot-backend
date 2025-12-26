// Normalize keyword for matching/deduplication (remove accents, collapse spaces, lowercase)
function normalizeKeyword(raw = '') {
	try {
		const noAccent = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		return noAccent.replace(/\s+/g, ' ').trim().toLowerCase();
	} catch (_) {
		return String(raw || '').replace(/\s+/g, ' ').trim().toLowerCase();
	}
}

module.exports = async function ensureKeyword(connection, originalKw, uploaderId, keywordColumn = 'KeywordText') {
	const kwText = String(originalKw || '').trim();
	if (!kwText) return null;

	const normalized = normalizeKeyword(kwText);
	const MIN_LEN = 2;
	const MAX_LEN = 120;
	const hasAlphaNum = /[a-zA-Zก-๙0-9]/.test(normalized);
	if (!normalized || normalized.length < MIN_LEN || normalized.length > MAX_LEN || !hasAlphaNum) {
		console.warn(`⚠️  Skipping keyword (failed length/charset check): "${kwText}"`);
		return null;
	}

	// Allow keywords even if they are stopwords (e.g., domain-specific terms like "ทุน")
	// The auto-whitelist in loadStopwords.js will protect them from being filtered

	// Guard keywordColumn to allowed columns only
	const allowedColumns = new Set(['KeywordText']);
	if (!allowedColumns.has(keywordColumn)) {
		keywordColumn = 'KeywordText';
	}

	const officerId = Number.isInteger(uploaderId) ? uploaderId : null;

	// Upsert keyword with normalized uniqueness + hit counter (graceful fallback when columns missing)
	// Prefer inserting NormalizedText when available to satisfy schemas where it's NOT NULL
	const upsertSql = `INSERT INTO Keywords (\`${keywordColumn}\`, NormalizedText, OfficerID, HitCount)
		VALUES (?, ?, ?, 1)
		ON DUPLICATE KEY UPDATE
		  HitCount = IFNULL(HitCount, 0) + 1,
		  OfficerID = IFNULL(OfficerID, VALUES(OfficerID))`;
	const legacyUpsertSql = `INSERT INTO Keywords (\`${keywordColumn}\`, OfficerID)
		VALUES (?, ?)
		ON DUPLICATE KEY UPDATE
		  OfficerID = IFNULL(OfficerID, VALUES(OfficerID))`;

	const execUpsert = async (offId, sql, includeNormalized = true) => {
		if (includeNormalized) return connection.query(sql, [kwText, normalized, offId]);
		return connection.query(sql, [kwText, offId]);
	};

	let resInsert = null;
	try {
		[resInsert] = await execUpsert(officerId, upsertSql);
	} catch (e) {
		// HitCount/NormalizedText columns missing -> fallback to legacy upsert
		const isMissingColumn = e && (e.code === 'ER_BAD_FIELD_ERROR' || e.errno === 1054);
		if (isMissingColumn) {
			try {
				[resInsert] = await execUpsert(officerId, legacyUpsertSql);
			} catch (fallbackErr) {
				resInsert = null;
			}
			// continue to FK retry if needed
		} else if (e && (e.errno === 1452 || e.code === 'ER_NO_REFERENCED_ROW_2')) {
			// FK error -> retry with NULL OfficerID
			try {
				[resInsert] = await execUpsert(null, upsertSql);
			} catch (innerErr) {
				// fallback to legacy without FK
				const innerMissingColumn = innerErr && (innerErr.code === 'ER_BAD_FIELD_ERROR' || innerErr.errno === 1054);
				if (innerMissingColumn) {
					try {
						[resInsert] = await execUpsert(null, legacyUpsertSql);
					} catch (_) {
						resInsert = null;
					}
				} else {
					resInsert = null;
				}
			}
		} else {
			resInsert = null;
		}
	}

	let keywordId = (resInsert && typeof resInsert.insertId === 'number' && resInsert.insertId > 0)
		? resInsert.insertId
		: null;
	let created = !!(resInsert && typeof resInsert.insertId === 'number' && resInsert.insertId > 0);

	// lookup by normalized text if insert didn't give an id (duplicate path)
	if (!keywordId) {
		try {
			const [found] = await connection.query(
				'SELECT KeywordID FROM Keywords WHERE NormalizedText = ? LIMIT 1',
				[normalized]
			);
			if (found && found.length > 0) {
				keywordId = found[0].KeywordID;
			}
		} catch (lookupErr) {
			// NormalizedText not available -> fallback to raw column lookup
			try {
				const [foundLegacy] = await connection.query(
					`SELECT KeywordID FROM Keywords WHERE \`${keywordColumn}\` = ? LIMIT 1`,
					[kwText]
				);
				if (foundLegacy && foundLegacy.length > 0) {
					keywordId = foundLegacy[0].KeywordID;
				}
			} catch (_) { /* ignore */ }
		}
	}

	// final fallback
	if (!keywordId) {
		try {
			const [last] = await connection.query('SELECT LAST_INSERT_ID() AS id');
			if (last && last.length > 0 && last[0].id) {
				keywordId = last[0].id;
				created = true;
			}
		} catch (_) { /* ignore */ }
	}

	return { keywordId: keywordId || null, created: !!created };
};
