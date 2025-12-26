-- Add meta columns to IntentHints for auto-learning provenance
ALTER TABLE IntentHints
  ADD COLUMN AutoAdded TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN Source VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN ExampleContext TEXT NULL DEFAULT NULL;
