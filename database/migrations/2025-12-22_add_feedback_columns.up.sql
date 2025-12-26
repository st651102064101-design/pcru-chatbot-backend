-- Add columns expected by services: Timestamp, FeedbackReason, FeedbackComment, HandledAt
ALTER TABLE Feedbacks
  ADD COLUMN IF NOT EXISTS `Timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `FeedbackValue`,
  ADD COLUMN IF NOT EXISTS `FeedbackReason` VARCHAR(100) NULL AFTER `FeedbackValue`,
  ADD COLUMN IF NOT EXISTS `FeedbackComment` TEXT NULL AFTER `FeedbackReason`,
  ADD COLUMN IF NOT EXISTS `HandledAt` DATETIME NULL DEFAULT NULL AFTER `FeedbackComment`;

CREATE INDEX IF NOT EXISTS idx_feedbacks_reason ON Feedbacks(FeedbackReason);
CREATE INDEX IF NOT EXISTS idx_feedbacks_handled ON Feedbacks(HandledAt);

-- Backfill from existing columns if present
UPDATE Feedbacks SET FeedbackReason = Reason WHERE (FeedbackReason IS NULL OR FeedbackReason='') AND Reason IS NOT NULL;
UPDATE Feedbacks SET `Timestamp` = FeedbackDate WHERE (Timestamp IS NULL OR Timestamp='0000-00-00 00:00:00') AND FeedbackDate IS NOT NULL;
UPDATE Feedbacks SET HandledAt = NOW() WHERE Handled = 1 AND HandledAt IS NULL;

-- Note: this migration keeps old columns Reason/FeedbackDate/Handled for safety; a later migration can drop/rename them once verified.
