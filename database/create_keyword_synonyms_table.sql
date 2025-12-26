-- ============================================
-- ตาราง KeywordSynonyms (คำพ้อง/คำสนับสนุน)
-- ============================================
-- ใช้สำหรับเก็บความสัมพันธ์ระหว่างคำที่ผู้ใช้พิมพ์ (input_word)
-- กับ Keyword หลักในระบบ พร้อมคะแนนความคล้ายคลึง
--
-- ตัวอย่าง:
--   input_word: "หอใน"  -> target_keyword: "หอพัก"  -> score: 0.95
--   input_word: "เทอม"  -> target_keyword: "ต่อเทอม" -> score: 0.90
-- ============================================

CREATE TABLE IF NOT EXISTS KeywordSynonyms (
    SynonymID INT AUTO_INCREMENT PRIMARY KEY,
    
    -- คำที่ผู้ใช้พิมพ์เข้ามา (เช่น "หอใน", "เทอม")
    InputWord VARCHAR(255) NOT NULL,
    
    -- โยงไปหา Keyword หลักในตาราง Keywords
    TargetKeywordID INT NOT NULL,
    
    -- คะแนนความคล้ายคลึง (0.00 - 1.00)
    SimilarityScore DECIMAL(3,2) NOT NULL DEFAULT 0.80,
    
    -- คำอธิบายบทบาท (เช่น "คำพ้อง", "คำสนับสนุน", "คำย่อ")
    RoleDescription VARCHAR(100) DEFAULT 'คำพ้อง',
    
    -- สถานะ (1 = Active, 0 = Inactive)
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Timestamps
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key ไปยังตาราง Keywords
    CONSTRAINT fk_synonym_target_keyword
        FOREIGN KEY (TargetKeywordID) 
        REFERENCES Keywords(KeywordID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- ป้องกันไม่ให้มี InputWord ซ้ำกันสำหรับ Keyword เดียวกัน
    UNIQUE KEY unique_input_target (InputWord, TargetKeywordID),
    
    -- Index สำหรับค้นหาเร็ว
    INDEX idx_input_word (InputWord),
    INDEX idx_target_keyword (TargetKeywordID),
    INDEX idx_similarity_score (SimilarityScore),
    INDEX idx_is_active (IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ข้อมูลตัวอย่าง (Optional - ลบออกได้ถ้าไม่ต้องการ)
-- ============================================
-- INSERT INTO KeywordSynonyms (InputWord, TargetKeywordID, SimilarityScore, RoleDescription) VALUES
-- ('หอใน', 1, 0.95, 'คำพ้อง: หอใน มีความหมายใกล้เคียง หอพัก'),
-- ('เทอม', 2, 0.90, 'คำสนับสนุน: เทอม สนับสนุน ต่อเทอม');
