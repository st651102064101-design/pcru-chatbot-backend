-- Revert migration: remove added columns and indexes
ALTER TABLE Feedbacks
  DROP INDEX IF EXISTS idx_feedbacks_reason,
  DROP INDEX IF EXISTS idx_feedbacks_handled;

ALTER TABLE Feedbacks
  DROP COLUMN IF EXISTS HandledAt,
  DROP COLUMN IF EXISTS FeedbackComment,
  DROP COLUMN IF EXISTS FeedbackReason,
  DROP COLUMN IF EXISTS `Timestamp`;

-- Warning: data contained in these columns will be lost when rolling back.
