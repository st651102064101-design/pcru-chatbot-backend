-- Rollback for 2025-12-22_add_categories_pk.up.sql
-- WARNING: This down migration will attempt to remove CategoriesPK and the QuestionsAnswers.CategoriesPK FK.
-- It will fail or cause data loss if duplicate CategoriesID values exist. Only run if you understand the data state.

-- 1) Remove FK and column from QuestionsAnswers
ALTER TABLE `QuestionsAnswers` DROP FOREIGN KEY `fk_qa_categories_pk`;
ALTER TABLE `QuestionsAnswers` DROP INDEX `idx_qs_categoriespk`;
ALTER TABLE `QuestionsAnswers` DROP COLUMN `CategoriesPK`;

-- 2) Drop index on CategoriesID (we'll re-add primary key on CategoriesID)
ALTER TABLE `Categories` DROP INDEX `idx_categoriesid`;

-- 3) Drop surrogate PK and restore CategoriesID as PRIMARY KEY
ALTER TABLE `Categories` DROP PRIMARY KEY;
ALTER TABLE `Categories` DROP COLUMN `CategoriesPK`;
ALTER TABLE `Categories` ADD PRIMARY KEY (`CategoriesID`);

-- Note: Before running this down migration ensure there are no duplicate CategoriesID rows.
