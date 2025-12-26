-- Migration: Add CategoriesPK surrogate primary key and allow true duplicates for Categories
-- Run this on dev/staging first. Ensure you have DB backups before running in production.

-- 1) Drop existing PRIMARY KEY on Categories (CategoriesID) and add CategoriesPK
ALTER TABLE `Categories` DROP PRIMARY KEY;
ALTER TABLE `Categories` ADD COLUMN `CategoriesPK` INT NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (`CategoriesPK`);

-- 2) Ensure an index exists on CategoriesID (so FK references that column remain supported)
ALTER TABLE `Categories` ADD INDEX `idx_categoriesid` (`CategoriesID`);

-- 3) Add CategoriesPK column to QuestionsAnswers and populate it
ALTER TABLE `QuestionsAnswers` ADD COLUMN `CategoriesPK` INT NULL, ADD INDEX `idx_qs_categoriespk` (`CategoriesPK`);
UPDATE `QuestionsAnswers` q JOIN `Categories` c ON q.CategoriesID = c.CategoriesID SET q.CategoriesPK = c.CategoriesPK;
ALTER TABLE `QuestionsAnswers` ADD CONSTRAINT `fk_qa_categories_pk` FOREIGN KEY (`CategoriesPK`) REFERENCES `Categories` (`CategoriesPK`) ON DELETE SET NULL;

-- 4) (Optional) For other referencing tables, repeat similar steps.

-- Note: This migration does NOT remove the existing CategoriesID column; it simply adds a surrogate PK
-- and a matching FK column in QuestionsAnswers so we can reference categories deterministically even if
-- multiple rows have the same CategoriesID.

-- IMPORTANT: Reverting this migration is only safe if CategoriesID is still unique per row; a down migration
-- will be provided separately but may fail if duplicates are present.
