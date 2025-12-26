-- Update Stopwords table with comprehensive Thai stopwords (pythainlp standard)
-- Run this script to add missing stopwords to existing database
-- This script is idempotent (can be run multiple times safely)

-- Add 'อยาก' and other missing stopwords
INSERT IGNORE INTO Stopwords (StopwordText) VALUES
-- Missing from original list
('อยาก'),('หาก'),('ถ้า'),('เมื่อ'),('เพราะ'),('เนื่องจาก'),('โดย'),('ซึ่ง'),('อัน'),
-- Pronouns
('เรา'),('เขา'),('มัน'),('คุณ'),('ท่าน'),('นั่น'),('อย่าง'),
-- Verbs and modifiers  
('อยู่'),('ต้อง'),('ควร'),('จะ'),('ย่อม'),('เคย'),('กำลัง'),('ขอ'),('ช่วย'),('ทำ'),('ใช้'),
-- Negatives and questions
('ไม่ใช่'),('มิ'),('มิได้'),('อะไร'),('ใคร'),('ไหน'),('เท่าไร'),('อย่างไร'),
-- Prepositions
('นอก'),('บน'),('ล่าง'),('หน้า'),('หลัง'),('ข้าง'),('ระหว่าง'),('ก่อน'),('ตาม'),('แห่ง'),('จาก'),('ถึง'),('สู่'),('ไว้'),
-- Quantifiers
('ทุก'),('แต่ละ'),('บาง'),('หลาย'),('น้อย'),('มาก'),('เล็ก'),('ใหญ่'),('สูง'),('ต่ำ'),
('หนึ่ง'),('สอง'),('สาม'),('ห้า'),('สิบ'),
-- Time expressions
('วัน'),('เดือน'),('ปี'),('ครั้ง'),('ช่วง'),('ตอน'),('เวลา'),('ขณะ'),
-- Polite particles
('จ้า'),('จ๊ะ'),('จ๋า'),('ฮะ'),('เหรอ'),
-- Others
('แค่'),('เท่า'),('เพียง'),('เฉพาะ'),('ทั้ง'),('ทั้งนี้'),('ทั้งหมด'),('อื่น'),
('เดียว'),('เดียวกัน'),('กัน'),('ขึ้น'),('ลง'),('ออก'),('เข้า'),('ผ่าน'),('ถูก'),
('เกี่ยวกับ'),('เกี่ยว'),('เรื่อง'),('ราย'),('ส่วน'),('ภาย'),('นอกจาก'),('ยกเว้น'),
('พร้อม'),('รวม'),('การ'),('ความ'),('ใด'),('นัก'),('แบบ'),('แห่'),('ด้วย'),('ดี'),
('ระ'),('ตั้ง'),('ตัว');

-- Show summary
SELECT 
  COUNT(*) as TotalStopwords,
  MIN(CreatedAt) as FirstAdded,
  MAX(UpdatedAt) as LastUpdated
FROM Stopwords;

-- Show sample of stopwords
SELECT StopwordText FROM Stopwords ORDER BY StopwordText LIMIT 20;

COMMIT;
