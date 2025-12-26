-- Add HandledAt column to track when unlike feedback was handled
-- This column will be used to:
-- 1. Mark feedback as handled by officer
-- 2. Auto-delete handled feedbacks after 30 days

ALTER TABLE Feedbacks 
ADD COLUMN HandledAt DATETIME NULL DEFAULT NULL AFTER FeedbackComment;

-- Create index for efficient cleanup queries
CREATE INDEX idx_feedbacks_handled ON Feedbacks(HandledAt);

-- Comment: HandledAt = NULL means not handled yet, 
--          HandledAt = datetime means handled at that time
