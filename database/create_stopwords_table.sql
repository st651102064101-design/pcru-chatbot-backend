-- Create Stopwords table
CREATE TABLE IF NOT EXISTS Stopwords (
  StopwordID INT AUTO_INCREMENT PRIMARY KEY,
  StopwordText VARCHAR(100) NOT NULL UNIQUE,
  CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_stopword_text (StopwordText)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert Thai stopwords (based on pythainlp standard stopwords)
-- Source: https://github.com/PyThaiNLP/pythainlp/blob/dev/pythainlp/corpus/common/stopwords_th.txt
INSERT IGNORE INTO Stopwords (StopwordText) VALUES
-- Common particles and conjunctions
('และ'),('หรือ'),('แต่'),('หาก'),('ถ้า'),('เมื่อ'),('แล้ว'),('จึง'),('ดังนั้น'),('เพราะ'),
('เนื่องจาก'),('เพื่อ'),('โดย'),('กับ'),('ของ'),('ที่'),('ซึ่ง'),('อัน'),('ว่า'),
-- Pronouns and common words
('เรา'),('เขา'),('มัน'),('คุณ'),('ท่าน'),('นี้'),('นั้น'),('นั่น'),('อย่าง'),
-- Verbs and modifiers  
('เป็น'),('คือ'),('มี'),('ได้'),('ให้'),('ไป'),('มา'),('อยู่'),('อยาก'),('หา'),('ต้อง'),
('ควร'),('จะ'),('ย่อม'),('เคย'),('กำลัง'),('ขอ'),('ช่วย'),('ทำ'),('ใช้'),
-- Negatives and questions
('ไม่'),('ไม่ใช่'),('มิ'),('มิได้'),('อะไร'),('ใคร'),('ไหน'),('เท่าไร'),('อย่างไร'),
-- Prepositions
('ใน'),('นอก'),('บน'),('ล่าง'),('หน้า'),('หลัง'),('ข้าง'),('ระหว่าง'),('ก่อน'),('หลัง'),
('ตาม'),('แห่ง'),('จาก'),('ถึง'),('สู่'),('ไว้'),
-- Quantifiers
('ทุก'),('แต่ละ'),('บาง'),('หลาย'),('น้อย'),('มาก'),('เล็ก'),('ใหญ่'),('สูง'),('ต่ำ'),
('หนึ่ง'),('สอง'),('สาม'),('ห้า'),('สิบ'),
-- Time expressions
('วัน'),('เดือน'),('ปี'),('ครั้ง'),('ครั้ง'),('ช่วง'),('ตอน'),('เวลา'),('ขณะ'),
-- Polite particles
('ค่ะ'),('ครับ'),('คะ'),('ค่า'),('นะ'),('จ้า'),('จ๊ะ'),('จ๋า'),('ฮะ'),('เหรอ'),
-- Others
('ก็'),('แค่'),('เท่า'),('เพียง'),('เฉพาะ'),('ทั้ง'),('ทั้งนี้'),('ทั้งหมด'),('อื่น'),
('เดียว'),('เดียวกัน'),('กัน'),('ขึ้น'),('ลง'),('ออก'),('เข้า'),('ผ่าน'),('ถูก'),('เกี่ยวกับ'),
('เกี่ยว'),('เรื่อง'),('ราย'),('ส่วน'),('ภาย'),('นอกจาก'),('ยกเว้น'),('พร้อม'),('รวม'),
('การ'),('ความ'),('ใด'),('นัก'),('แบบ'),('แห่'),('ด้วย'),('ดี'),('ระ'),('ตั้ง'),('ตัว');
