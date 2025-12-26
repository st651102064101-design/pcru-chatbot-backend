-- Thai Word Pattern Auto-Learning System Tables
-- สร้างตารางสำหรับระบบเรียนรู้คำไทยอัตโนมัติ

-- 1. ตารางเก็บคำที่เป็นผู้สมัคร (Candidates)
CREATE TABLE IF NOT EXISTS SuggestedThaiWordPatterns (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  Word VARCHAR(255) NOT NULL UNIQUE,
  SuggestedType VARCHAR(50) DEFAULT 'general',
  Frequency INT DEFAULT 1,
  SuccessCount INT DEFAULT 0,
  TotalAttempts INT DEFAULT 0,
  AvgConfidence DECIMAL(5,4) DEFAULT 0,
  SuccessRate DECIMAL(5,2) DEFAULT 0,
  Status ENUM('pending', 'approved', 'rejected', 'expired') DEFAULT 'pending',
  FirstSeen DATETIME DEFAULT CURRENT_TIMESTAMP,
  LastSeen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_word (Word),
  INDEX idx_status (Status),
  INDEX idx_frequency (Frequency),
  INDEX idx_avg_confidence (AvgConfidence),
  INDEX idx_last_seen (LastSeen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='เก็บคำที่รอพิจารณาสำหรับระบบเรียนรู้อัตโนมัติ';

-- 2. ตารางเก็บค่า Config
CREATE TABLE IF NOT EXISTS ThaiWordPatternConfig (
  ConfigKey VARCHAR(100) PRIMARY KEY,
  ConfigValue TEXT NOT NULL,
  Description TEXT,
  UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='เก็บค่าการตั้งค่าระบบเรียนรู้คำไทย';

-- 3. Insert ค่า Config เริ่มต้น
INSERT INTO ThaiWordPatternConfig (ConfigKey, ConfigValue, Description) VALUES
('MIN_WORD_LENGTH', '3', 'ความยาวขั้นต่ำของคำที่จะบันทึก'),
('MIN_CONFIDENCE', '0.65', 'ความมั่นใจขั้นต่ำในการบันทึกคำ (0-1)'),
('MIN_FREQUENCY', '3', 'จำนวนครั้งขั้นต่ำก่อนพิจารณาอนุมัติ'),
('AUTO_APPROVE_FREQUENCY', '5', 'จำนวนครั้งที่พบสำหรับอนุมัติอัตโนมัติ'),
('AUTO_APPROVE_CONFIDENCE', '0.80', 'ความมั่นใจเฉลี่ยสำหรับอนุมัติอัตโนมัติ (0-1)'),
('AUTO_APPROVE_SUCCESS_RATE', '0.90', 'อัตราส่วนความสำเร็จสำหรับอนุมัติอัตโนมัติ (0-1)'),
('CANDIDATE_EXPIRE_DAYS', '90', 'จำนวนวันก่อนคำผู้สมัครหมดอายุ'),
('AUTO_LEARN_ENABLED', 'true', 'เปิด/ปิดการเรียนรู้อัตโนมัติ (true/false)'),
('CONFIG_CACHE_TTL', '3600', 'เวลา cache config ในหน่วยวินาที')
ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue), Description=VALUES(Description);

-- แสดงผลลัพธ์
SELECT 'สร้างตาราง SuggestedThaiWordPatterns เรียบร้อย' as Result;
SELECT 'สร้างตาราง ThaiWordPatternConfig เรียบร้อย' as Result;
SELECT 'เพิ่มค่า Config เริ่มต้นเรียบร้อย' as Result;
SELECT CONCAT('จำนวน Config: ', COUNT(*), ' รายการ') as Status FROM ThaiWordPatternConfig;
