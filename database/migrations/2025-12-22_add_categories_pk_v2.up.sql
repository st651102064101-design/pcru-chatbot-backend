-- Migration v2: handle self-referencing FK properly

-- 0) Backup your DB first!

-- 1) Drop self-referencing FK in Categories (parent link) so we can alter PK safely
ALTER TABLE `Categories` DROP FOREIGN KEY `fk_categories_parent`;

-- 2) Drop existing PRIMARY KEY on CategoriesID and add CategoriesPK surrogate PK
ALTER TABLE `Categories` DROP PRIMARY KEY;
ALTER TABLE `Categories` ADD COLUMN `CategoriesPK` INT NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (`CategoriesPK`);

-- 3) Ensure indexes on CategoriesID and ParentCategoriesID for FK / lookups
ALTER TABLE `Categories` ADD INDEX `idx_categoriesid` (`CategoriesID`), ADD INDEX `idx_parentcategoriesid` (`ParentCategoriesID`);

-- 4) Recreate self-referencing FK using the (non-unique) CategoriesID index
ALTER TABLE `Categories` ADD CONSTRAINT `fk_categories_parent` FOREIGN KEY (`ParentCategoriesID`) REFERENCES `Categories` (`CategoriesID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Add CategoriesPK to QuestionsAnswers and populate + add FK
ALTER TABLE `QuestionsAnswers` ADD COLUMN `CategoriesPK` INT NULL, ADD INDEX `idx_qs_categoriespk` (`CategoriesPK`);
UPDATE `QuestionsAnswers` q JOIN `Categories` c ON q.CategoriesID = c.CategoriesID SET q.CategoriesPK = c.CategoriesPK;
ALTER TABLE `QuestionsAnswers` ADD CONSTRAINT `fk_qa_categories_pk` FOREIGN KEY (`CategoriesPK`) REFERENCES `Categories` (`CategoriesPK`) ON DELETE SET NULL;

-- 6) Done. Verify data integrity and update services to use CategoriesPK for deterministic linking when needed.
