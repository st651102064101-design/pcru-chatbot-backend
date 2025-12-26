-- Add reason column to Feedbacks table for unlike feedback
ALTER TABLE Feedbacks 
ADD COLUMN FeedbackReason VARCHAR(100) NULL AFTER FeedbackValue,
ADD COLUMN FeedbackComment TEXT NULL AFTER FeedbackReason;

-- Create index for filtering by reason
CREATE INDEX idx_feedbacks_reason ON Feedbacks(FeedbackReason);
