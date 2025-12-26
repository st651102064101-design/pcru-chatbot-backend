-- Migration v4: safe table-swap with unique constraint/index names to avoid collisions
-- BACKUP DB before running.

-- 1) Create new table with surrogate PK (index names suffixed with _v4)
CREATE TABLE `Categories_new_v4` (
  `CategoriesPK` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `CategoriesID` varchar(50) NOT NULL,
  `CategoriesName` varchar(255) NOT NULL,
  `ParentCategoriesID` varchar(50) DEFAULT NULL,
  `OfficerID` int(11) DEFAULT NULL,
  `CategoriesPDF` text DEFAULT NULL,
  `CreatedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `UpdatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  INDEX `idx_categoriesid_v4` (`CategoriesID`),
  INDEX `idx_parentcategoriesid_v4` (`ParentCategoriesID`),
  INDEX `idx_officerid_v4` (`OfficerID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Copy data
INSERT INTO `Categories_new_v4` (`CategoriesID`, `CategoriesName`, `ParentCategoriesID`, `OfficerID`, `CategoriesPDF`, `CreatedAt`, `UpdatedAt`)
SELECT `CategoriesID`, `CategoriesName`, `ParentCategoriesID`, `OfficerID`, `CategoriesPDF`, `CreatedAt`, `UpdatedAt` FROM `Categories`;

-- 3) Create FKs on the new table with unique names
ALTER TABLE `Categories_new_v4` ADD CONSTRAINT `fk_categories_parent_v4` FOREIGN KEY (`ParentCategoriesID`) REFERENCES `Categories_new_v4` (`CategoriesID`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Categories_new_v4` ADD CONSTRAINT `fk_categories_officer_v4` FOREIGN KEY (`OfficerID`) REFERENCES `Officers` (`OfficerID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Add CategoriesPK to QuestionsAnswers, populate, and add FK (unique name)
ALTER TABLE `QuestionsAnswers` ADD COLUMN `CategoriesPK` INT NULL, ADD INDEX `idx_qs_categoriespk_v4` (`CategoriesPK`);
UPDATE `QuestionsAnswers` q JOIN `Categories_new_v4` c ON q.CategoriesID = c.CategoriesID SET q.CategoriesPK = c.CategoriesPK;
ALTER TABLE `QuestionsAnswers` ADD CONSTRAINT `fk_qa_categories_pk_v4` FOREIGN KEY (`CategoriesPK`) REFERENCES `Categories_new_v4` (`CategoriesPK`) ON DELETE SET NULL;

-- 5) Swap tables (rename old to backup, bring new in)
RENAME TABLE `Categories` TO `Categories_old_20251222`, `Categories_new_v4` TO `Categories`;

-- After manual verification, you may drop `Categories_old_20251222`.
