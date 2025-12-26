-- Add IconType column to Categories table
-- This allows storing icon type from admin panel without hardcoding in frontend

ALTER TABLE Categories 
ADD COLUMN IconType VARCHAR(50) DEFAULT 'default' COMMENT 'Icon type: news, money, user, building, book, phone, clipboard, calendar, default';

-- Update existing categories with appropriate icon types based on their names
UPDATE Categories SET IconType = 'news' WHERE CategoriesName LIKE '%ข่าว%' OR CategoriesName LIKE '%ประกาศ%';
UPDATE Categories SET IconType = 'money' WHERE CategoriesName LIKE '%ทุน%' OR CategoriesName LIKE '%scholarship%';
UPDATE Categories SET IconType = 'user' WHERE CategoriesName LIKE '%บริการ%' OR CategoriesName LIKE '%นักศึกษา%';
UPDATE Categories SET IconType = 'building' WHERE CategoriesName LIKE '%หอพัก%' OR CategoriesName LIKE '%บ้าน%' OR CategoriesName LIKE '%ที่พัก%';
UPDATE Categories SET IconType = 'book' WHERE CategoriesName LIKE '%การศึกษา%' OR CategoriesName LIKE '%หลักสูตร%';
UPDATE Categories SET IconType = 'phone' WHERE CategoriesName LIKE '%ติดต่อ%' OR CategoriesName LIKE '%สอบถาม%';
UPDATE Categories SET IconType = 'clipboard' WHERE CategoriesName LIKE '%สมัคร%' OR CategoriesName LIKE '%รับสมัคร%';
UPDATE Categories SET IconType = 'calendar' WHERE CategoriesName LIKE '%อบรม%' OR CategoriesName LIKE '%กิจกรรม%' OR CategoriesName LIKE '%ปฏิทิน%';

-- Verify the update
SELECT CategoriesID, CategoriesName, IconType FROM Categories ORDER BY CategoriesID;
