/**
 * API endpoints for managing Stopwords
 * CRUD operations for stopwords management
 */

const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();
const config = require('../config');
const { clearStopwordsCache } = require('../services/stopwords/loadStopwords');

// Create MySQL pool
function createPool() {
  return mysql.createPool({
    host: config.db?.host,
    user: config.db?.user,
    password: config.db?.password,
    database: config.db?.database,
    charset: 'utf8mb4'
  });
}

/**
 * GET /stopwords
 * Get all stopwords
 */
router.get('/', async (req, res) => {
  const pool = createPool();

  try {
    const [stopwords] = await pool.query(
      'SELECT StopwordID, StopwordText, CreatedAt, UpdatedAt FROM Stopwords ORDER BY StopwordText'
    );

    res.json(stopwords);
  } catch (error) {
    console.error('Error fetching stopwords:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * POST /stopwords
 * Add a new stopword
 * Body: { text: 'คำ' }
 */
router.post('/', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid text' });
  }

  const cleanText = text.trim().toLowerCase();
  
  if (!cleanText) {
    return res.status(400).json({ error: 'Stopword text cannot be empty' });
  }

  const pool = createPool();

  try {
    // Check if already exists
    const [existing] = await pool.query(
      'SELECT StopwordID FROM Stopwords WHERE StopwordText = ?',
      [cleanText]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        error: 'Stopword already exists', 
        existingId: existing[0].StopwordID 
      });
    }

    // Insert new stopword
    const [result] = await pool.query(
      'INSERT INTO Stopwords (StopwordText) VALUES (?)',
      [cleanText]
    );

    res.status(201).json({
      message: 'Stopword added successfully',
      id: result.insertId,
      text: cleanText
    });
  } catch (error) {
    console.error('Error adding stopword:', error);
    
    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Stopword already exists' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * PUT /stopwords/:id
 * Update a stopword
 * Body: { text: 'คำใหม่' }
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid text' });
  }

  const cleanText = text.trim().toLowerCase();
  
  if (!cleanText) {
    return res.status(400).json({ error: 'Stopword text cannot be empty' });
  }

  const pool = createPool();

  try {
    // Check if stopword exists
    const [existing] = await pool.query(
      'SELECT StopwordID FROM Stopwords WHERE StopwordID = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Stopword not found' });
    }

    // Check if new text already exists (different ID)
    const [duplicate] = await pool.query(
      'SELECT StopwordID FROM Stopwords WHERE StopwordText = ? AND StopwordID != ?',
      [cleanText, id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({ 
        error: 'Another stopword with this text already exists',
        existingId: duplicate[0].StopwordID 
      });
    }

    // Update stopword
    await pool.query(
      'UPDATE Stopwords SET StopwordText = ? WHERE StopwordID = ?',
      [cleanText, id]
    );

    res.json({
      message: 'Stopword updated successfully',
      id: parseInt(id),
      text: cleanText
    });
  } catch (error) {
    console.error('Error updating stopword:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Stopword already exists' });
    }
    
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * DELETE /stopwords/:id
 * Delete a stopword
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const pool = createPool();

  try {
    // Check if stopword exists
    const [existing] = await pool.query(
      'SELECT StopwordID, StopwordText FROM Stopwords WHERE StopwordID = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Stopword not found' });
    }

    const deletedText = existing[0].StopwordText;

    // Delete stopword
    await pool.query('DELETE FROM Stopwords WHERE StopwordID = ?', [id]);

    res.json({
      message: 'Stopword deleted successfully',
      id: parseInt(id),
      deletedText
    });
  } catch (error) {
    console.error('Error deleting stopword:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * POST /stopwords/bulk
 * Add multiple stopwords at once
 * Body: { words: ['คำ1', 'คำ2', 'คำ3'] }
 */
router.post('/bulk', async (req, res) => {
  const { words } = req.body;

  if (!Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid words array' });
  }

  const pool = createPool();

  try {
    const results = {
      added: [],
      skipped: [],
      errors: []
    };

    for (const word of words) {
      if (!word || typeof word !== 'string') {
        results.errors.push({ word, error: 'Invalid word' });
        continue;
      }

      const cleanText = word.trim().toLowerCase();
      if (!cleanText) {
        results.skipped.push({ word, reason: 'Empty after trim' });
        continue;
      }

      try {
        await pool.query(
          'INSERT IGNORE INTO Stopwords (StopwordText) VALUES (?)',
          [cleanText]
        );
        results.added.push(cleanText);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          results.skipped.push({ word: cleanText, reason: 'Already exists' });
        } else {
          results.errors.push({ word: cleanText, error: err.message });
        }
      }
    }

    res.json({
      message: 'Bulk operation completed',
      added: results.added.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
      details: results
    });
  } catch (error) {
    console.error('Error in bulk add:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * DELETE /stopwords/bulk
 * Delete multiple stopwords at once
 * Body: { ids: [1, 2, 3] }
 */
router.delete('/bulk', async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid ids array' });
  }

  const pool = createPool();

  try {
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query(
      `DELETE FROM Stopwords WHERE StopwordID IN (${placeholders})`,
      ids
    );

    res.json({
      message: 'Bulk delete completed',
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    res.status(500).json({ error: error.message });
  } finally {
    await pool.end();
  }
});

/**
 * POST /stopwords/refresh
 * Force clear stopwords cache so changes in DB take effect immediately
 */
router.post('/refresh', async (req, res) => {
  try {
    clearStopwordsCache();
    res.json({ message: 'Stopwords cache cleared' });
  } catch (error) {
    console.error('Error refreshing stopwords cache:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /stopwords/seed
 * เติมคำ stopwords มาตรฐานจาก pythainlp อัตโนมัติ
 * คำที่มีอยู่แล้วจะถูกข้าม
 */
router.post('/seed', async (req, res) => {
  const pool = createPool();

  // รายการ stopwords มาตรฐานจาก pythainlp (Thai standard stopwords)
  const STANDARD_STOPWORDS = [
    // Pronouns
    'ผม', 'ฉัน', 'เรา', 'เขา', 'มัน', 'คุณ', 'ท่าน', 'ใคร', 'อะไร', 'ที่ไหน',
    // Particles & Polite endings
    'ครับ', 'ค่ะ', 'คะ', 'นะ', 'นะครับ', 'นะคะ', 'จ้า', 'จ๊ะ', 'จ๋า', 'ฮะ', 'เหรอ', 'หรือ',
    // Common verbs/auxiliaries
    'เป็น', 'คือ', 'มี', 'อยู่', 'ได้', 'ไป', 'มา', 'ทำ', 'ให้', 'ใช้', 'ต้อง', 'ควร', 'จะ', 'จะได้',
    'ย่อม', 'เคย', 'กำลัง', 'ขอ', 'ช่วย', 'อยาก', 'ต้องการ', 'พบ', 'หา', 'ดู', 'เห็น',
    // Prepositions/Conjunctions
    'ที่', 'ซึ่ง', 'อัน', 'แห่ง', 'ของ', 'ใน', 'บน', 'ล่าง', 'หน้า', 'หลัง', 'ข้าง', 'นอก',
    'ระหว่าง', 'ก่อน', 'ตาม', 'จาก', 'ถึง', 'สู่', 'ไว้', 'กับ', 'และ', 'หรือ', 'แต่', 'เพราะ',
    'เนื่องจาก', 'โดย', 'ด้วย', 'พร้อม', 'รวม', 'ยกเว้น', 'นอกจาก', 'เกี่ยวกับ', 'เกี่ยว', 'เรื่อง',
    // Conditionals
    'ถ้า', 'หาก', 'เมื่อ', 'แม้', 'แม้ว่า', 'กรณี',
    // Demonstratives
    'นี้', 'นั้น', 'นี่', 'นั่น', 'โน้น', 'เหล่านี้', 'เหล่านั้น', 'อย่างนี้', 'อย่างนั้น',
    // Quantifiers
    'ทุก', 'แต่ละ', 'บาง', 'หลาย', 'น้อย', 'มาก', 'เล็ก', 'ใหญ่', 'สูง', 'ต่ำ', 'ทั้งหมด', 'ทั้งนี้', 'ทั้ง',
    'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า', 'สิบ',
    // Time expressions
    'วัน', 'เดือน', 'ปี', 'ครั้ง', 'ช่วง', 'ตอน', 'เวลา', 'ขณะ', 'ตั้งแต่', 'จนถึง', 'ก่อน', 'หลัง',
    // Modifiers
    'ดี', 'ไม่ดี', 'มาก', 'น้อย', 'เพียง', 'แค่', 'เท่า', 'เฉพาะ', 'อื่น', 'เดียว', 'เดียวกัน', 'กัน',
    // Direction/Movement
    'ขึ้น', 'ลง', 'ออก', 'เข้า', 'ผ่าน',
    // Abstract/Formal
    'การ', 'ความ', 'ใด', 'นัก', 'แบบ', 'ประเภท', 'ชนิด', 'ส่วน', 'ภาย', 'ราย', 'ตัว', 'อัน',
    // Question words
    'ไหน', 'เท่าไร', 'อย่างไร', 'ยังไง', 'ทำไม', 'เมื่อไหร่',
    // Misc common words
    'ก็', 'ก็ได้', 'เลย', 'แล้ว', 'แล้วก็', 'ยัง', 'อีก', 'แค่', 'เพียง', 'เท่านั้น', 'จริง', 'จริงๆ',
    'ประมาณ', 'ราว', 'ราวๆ', 'โดยประมาณ', 'เกือบ', 'เพิ่ม', 'ลด', 'เปลี่ยน', 'คง', 'ยัง', 'ถูก',
    // Extra common particles
    'นะจ๊ะ', 'นะจ้า', 'ได้ไหม', 'หรือเปล่า', 'ใช่ไหม', 'มั้ย', 'ได้มั้ย', 'บ้าง', 'หน่อย', 'สิ', 'ซิ', 'เถอะ',
    'เอา', 'อยาก', 'สนใจ', 'ถาม', 'ตอบ', 'บอก', 'พูด', 'คิด', 'รู้', 'รู้จัก', 'รู้สึก', 'เข้าใจ'
  ];

  try {
    let addedCount = 0;
    let skippedCount = 0;

    for (const word of STANDARD_STOPWORDS) {
      const cleanText = word.trim().toLowerCase();
      if (!cleanText) continue;

      try {
        // Use INSERT IGNORE to skip existing words
        const [result] = await pool.query(
          'INSERT IGNORE INTO Stopwords (StopwordText) VALUES (?)',
          [cleanText]
        );

        if (result.affectedRows > 0) {
          addedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') {
          console.error(`Error adding stopword "${cleanText}":`, err.message);
        }
        skippedCount++;
      }
    }

    // Clear cache after adding
    clearStopwordsCache();

    res.json({
      ok: true,
      message: addedCount > 0 
        ? `เติมข้อมูลสำเร็จ! เพิ่ม stopwords ใหม่ ${addedCount} คำ` 
        : 'ข้อมูลเป็นปัจจุบันอยู่แล้ว ไม่มีคำใหม่ที่ต้องเพิ่ม',
      addedCount,
      skippedCount,
      totalStandard: STANDARD_STOPWORDS.length
    });
  } catch (error) {
    console.error('Error seeding stopwords:', error);
    res.status(500).json({ ok: false, message: error.message });
  } finally {
    await pool.end();
  }
});

module.exports = router;

