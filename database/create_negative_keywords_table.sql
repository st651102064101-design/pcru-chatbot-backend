-- =====================================================
-- Table: NegativeKeywords (คำปฏิเสธ)
-- ใช้สำหรับดักจับคำปฏิเสธที่อยู่ก่อนหน้า Keyword
-- เพื่อเปลี่ยนคะแนนของ Keyword นั้นเป็นติดลบหรือศูนย์
-- =====================================================

CREATE TABLE IF NOT EXISTS NegativeKeywords (
    NegativeKeywordID INT AUTO_INCREMENT PRIMARY KEY,
    Word VARCHAR(100) NOT NULL UNIQUE COMMENT 'คำปฏิเสธ เช่น ไม่, ยกเว้น, อย่า',
    WeightModifier FLOAT NOT NULL DEFAULT -1.0 COMMENT 'ตัวคูณคะแนน: -1.0 = กลับเป็นลบ, 0.0 = ทำให้เป็นศูนย์',
    Description VARCHAR(255) DEFAULT NULL COMMENT 'คำอธิบายการใช้งาน',
    IsActive TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = ใช้งาน, 0 = ปิดใช้งาน',
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_word (Word),
    INDEX idx_active (IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- Seed Data: คำปฏิเสธพื้นฐานภาษาไทย
-- =====================================================

INSERT INTO NegativeKeywords (Word, WeightModifier, Description) VALUES
('ไม่', -1.0, 'คำปฏิเสธพื้นฐาน'),
('ไม่เอา', -1.0, 'ปฏิเสธโดยตรง'),
('ไม่ต้องการ', -1.0, 'ปฏิเสธความต้องการ'),
('ไม่อยาก', -1.0, 'ปฏิเสธความต้องการ'),
('ไม่ใช่', -1.0, 'ปฏิเสธตัวตน/สถานะ'),
('ยกเว้น', 0.0, 'ยกเว้นออกจากผลลัพธ์'),
('อย่า', -1.0, 'ห้ามทำ'),
('อย่าเอา', -1.0, 'ห้ามเอา'),
('มิได้', -1.0, 'คำปฏิเสธทางการ'),
('มิใช่', -1.0, 'คำปฏิเสธทางการ'),
('ห้าม', -1.0, 'ห้ามทำ'),
('บ่', -1.0, 'คำปฏิเสธภาษาถิ่น (อีสาน/เหนือ)'),
('บ่เอา', -1.0, 'คำปฏิเสธภาษาถิ่น'),
('ไม่ชอบ', -1.0, 'ปฏิเสธความชอบ'),
('เกลียด', -1.0, 'ปฏิเสธอย่างรุนแรง'),
('งด', 0.0, 'งดเว้น'),
('เว้น', 0.0, 'เว้นออก'),
('นอกจาก', 0.0, 'ยกเว้นกรณี'),
('แต่ไม่ใช่', -1.0, 'ปฏิเสธบางส่วน'),
('ไม่รวม', 0.0, 'ไม่รวมในผลลัพธ์')
ON DUPLICATE KEY UPDATE 
    WeightModifier = VALUES(WeightModifier),
    Description = VALUES(Description);

-- =====================================================
-- ตรวจสอบผลลัพธ์
-- =====================================================
-- SELECT * FROM NegativeKeywords;
