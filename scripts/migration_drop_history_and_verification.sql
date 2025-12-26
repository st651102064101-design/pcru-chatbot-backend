-- Migration: drop ConfidenceHistory and VerificationLog tables
-- Run after taking backups (see scripts/backup_tables.sh)

DROP TABLE IF EXISTS ConfidenceHistory;
DROP TABLE IF EXISTS VerificationLog;

-- Note: This will permanently remove logs and history used for analytics.
-- Keep your backups if you need to restore later.
