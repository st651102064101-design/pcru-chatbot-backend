-- Add normalized keyword and hit count tracking to reduce duplicate growth
-- Safe to run multiple times (IF NOT EXISTS guards)

ALTER TABLE Keywords
  ADD COLUMN IF NOT EXISTS NormalizedText VARCHAR(255)
    GENERATED ALWAYS AS (LOWER(TRIM(KeywordText))) STORED,
  ADD COLUMN IF NOT EXISTS HitCount INT NOT NULL DEFAULT 1;

-- Backfill hit counts where null (if column pre-existed without default)
UPDATE Keywords SET HitCount = 1 WHERE HitCount IS NULL;

-- Add unique index on normalized text to avoid case/space duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_keywords_normalized ON Keywords (NormalizedText);
