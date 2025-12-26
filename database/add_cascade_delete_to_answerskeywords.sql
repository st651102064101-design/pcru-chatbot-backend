-- Migration: Add ON DELETE CASCADE to AnswersKeywords FK
-- Purpose: Ensure when a Keyword is deleted, all references in AnswersKeywords are cascade deleted
-- Date: 2024-12-17

-- 1. Drop existing FK constraint
ALTER TABLE `AnswersKeywords`
DROP FOREIGN KEY `fk_ak_keyword`;

-- 2. Add FK with ON DELETE CASCADE
ALTER TABLE `AnswersKeywords`
ADD CONSTRAINT `fk_ak_keyword` 
FOREIGN KEY (`KeywordID`) 
REFERENCES `Keywords` (`KeywordID`) 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- 3. Verify the change
-- SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, 
--        REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
-- FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
-- WHERE TABLE_NAME = 'AnswersKeywords' AND CONSTRAINT_NAME = 'fk_ak_keyword';
