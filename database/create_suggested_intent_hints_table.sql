-- database/create_suggested_intent_hints_table.sql
-- Suggested-only storage for auto-learned intent hints pending manual approval

CREATE TABLE IF NOT EXISTS SuggestedIntentHints (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  QuestionsAnswersID INT NULL,
  IntentType VARCHAR(50) NOT NULL,
  HintText VARCHAR(100) NOT NULL,
  Confidence DECIMAL(5,4) DEFAULT 0.0,
  Occurrences INT DEFAULT 1,
  Source VARCHAR(50) DEFAULT 'background',
  Status ENUM('pending','approved','rejected') DEFAULT 'pending',
  Meta JSON NULL,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_suggest_qahint (QuestionsAnswersID, IntentType, HintText),
  INDEX idx_status (Status),
  INDEX idx_qaid (QuestionsAnswersID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;