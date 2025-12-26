-- Alter IntentHints table to support 'list' IntentType
ALTER TABLE IntentHints 
MODIFY COLUMN IntentType ENUM('count','list','other') NOT NULL DEFAULT 'count';
