-- Add columns for auto-learning support in IntentHints table
-- Run this migration once

-- Add AutoAdded column to track if hint was auto-generated
ALTER TABLE IntentHints 
ADD COLUMN IF NOT EXISTS AutoAdded TINYINT(1) NOT NULL DEFAULT 0;

-- Add Source column to track where the hint came from
ALTER TABLE IntentHints 
ADD COLUMN IF NOT EXISTS Source VARCHAR(50) NULL DEFAULT NULL COMMENT 'Source: user_query, questionsanswers, keywords, manual';

-- Add ExampleContext column to store example text that triggered this hint
ALTER TABLE IntentHints 
ADD COLUMN IF NOT EXISTS ExampleContext TEXT NULL DEFAULT NULL COMMENT 'Example text that this hint was extracted from';

-- Add index on Source for filtering
CREATE INDEX IF NOT EXISTS idx_intenthints_source ON IntentHints(Source);

-- Add index on AutoAdded for filtering
CREATE INDEX IF NOT EXISTS idx_intenthints_autoadded ON IntentHints(AutoAdded);
