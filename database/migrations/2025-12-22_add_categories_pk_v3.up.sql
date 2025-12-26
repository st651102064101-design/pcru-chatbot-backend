-- Migration v3: create a new Categories table with surrogate PK and swap it in (safer approach)
-- WARNING: run on dev/staging first and have a DB dump BEFORE running in production.

-- 1) Create new table with CategoriesPK surrogate PK (no FKs to this table yet)
CREATE TABLE `Categories_new` (
  `CategoriesPK` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `CategoriesID` varchar(50) NOT NULL,
  `CategoriesName` varchar(255) NOT NULL,
  `ParentCategoriesID` varchar(50) DEFAULT NULL,
  `OfficerID` int(11) DEFAULT NULL,
  `CategoriesPDF` text DEFAULT NULL,
  `CreatedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `UpdatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  INDEX `idx_categoriesid` (`CategoriesID`),
  INDEX `idx_parentcategoriesid` (`ParentCategoriesID`),
  INDEX `idx_officerid` (`OfficerID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Copy data from old table (keeps the same CategoriesID values)
INSERT INTO `Categories_new` (`CategoriesID`, `CategoriesName`, `ParentCategoriesID`, `OfficerID`, `CategoriesPDF`, `CreatedAt`, `UpdatedAt`)
SELECT `CategoriesID`, `CategoriesName`, `ParentCategoriesID`, `OfficerID`, `CategoriesPDF`, `CreatedAt`, `UpdatedAt` FROM `Categories`;

-- 3) Add self-referencing FK now that Categories_new exists
ALTER TABLE `Categories_new` ADD CONSTRAINT `fk_categories_parent` FOREIGN KEY (`ParentCategoriesID`) REFERENCES `Categories_new` (`CategoriesID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Add fk to Officers (same as original)
ALTER TABLE `Categories_new` ADD CONSTRAINT `fk_categories_officer` FOREIGN KEY (`OfficerID`) REFERENCES `Officers` (`OfficerID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5) Add CategoriesPK to QuestionsAnswers and populate it by joining on CategoriesID
ALTER TABLE `QuestionsAnswers` ADD COLUMN `CategoriesPK` INT NULL, ADD INDEX `idx_qs_categoriespk` (`CategoriesPK`);
UPDATE `QuestionsAnswers` q JOIN `Categories_new` c ON q.CategoriesID = c.CategoriesID SET q.CategoriesPK = c.CategoriesPK;
ALTER TABLE `QuestionsAnswers` ADD CONSTRAINT `fk_qa_categories_pk` FOREIGN KEY (`CategoriesPK`) REFERENCES `Categories_new` (`CategoriesPK`) ON DELETE SET NULL;

-- 6) Swap tables: rename old table to backup and replace with new
RENAME TABLE `Categories` TO `Categories_old`, `Categories_new` TO `Categories`;

-- 7) (Optional) After verification, drop Categories_old
-- DROP TABLE `Categories_old`;

-- Note: after this migration, there will be a new surrogate PK column `CategoriesPK` and the
-- string `CategoriesID` will no longer be the primary key, allowing duplicate CategoriesID values.
