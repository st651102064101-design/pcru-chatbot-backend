/**
 * CRUD Routes สำหรับจัดการ Keyword Synonyms (คำพ้อง/คำสนับสนุน)
 * 
 * Endpoints:
 *   GET    /synonyms           - ดึงรายการคำพ้องทั้งหมด
 *   GET    /synonyms/:id       - ดึงคำพ้องตาม ID
 *   POST   /synonyms           - เพิ่มคำพ้องใหม่
 *   PUT    /synonyms/:id       - แก้ไขคำพ้อง
 *   DELETE /synonyms/:id       - ลบคำพ้อง
 *   GET    /synonyms/stats     - สถิติภาพรวม
 */

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  
  // ============================================
  // GET /synonyms/stats - สถิติภาพรวม
  // ============================================
  router.get('/stats', async (req, res) => {
    try {
      const [totalResult] = await pool.query(
        'SELECT COUNT(*) as total FROM KeywordSynonyms'
      );
      const [activeResult] = await pool.query(
        'SELECT COUNT(*) as active FROM KeywordSynonyms WHERE IsActive = 1'
      );
      const [avgScoreResult] = await pool.query(
        'SELECT AVG(SimilarityScore) as avgScore FROM KeywordSynonyms WHERE IsActive = 1'
      );
      const [keywordsWithSynonymsResult] = await pool.query(
        'SELECT COUNT(DISTINCT TargetKeywordID) as count FROM KeywordSynonyms WHERE IsActive = 1'
      );
      
      res.status(200).json({
        success: true,
        data: {
          total: totalResult[0]?.total || 0,
          active: activeResult[0]?.active || 0,
          inactive: (totalResult[0]?.total || 0) - (activeResult[0]?.active || 0),
          avgScore: parseFloat(avgScoreResult[0]?.avgScore || 0).toFixed(2),
          keywordsWithSynonyms: keywordsWithSynonymsResult[0]?.count || 0
        }
      });
    } catch (error) {
      console.error('❌ Error fetching synonym stats:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // GET /synonyms - ดึงรายการทั้งหมด
  // ============================================
  router.get('/', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT 
          s.SynonymID,
          s.InputWord,
          s.TargetKeywordID,
          k.KeywordText AS TargetKeyword,
          s.SimilarityScore,
          s.RoleDescription,
          s.IsActive,
          s.CreatedAt,
          s.UpdatedAt
        FROM KeywordSynonyms s
        LEFT JOIN Keywords k ON s.TargetKeywordID = k.KeywordID
        ORDER BY s.SimilarityScore DESC, s.InputWord ASC
      `);
      
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('❌ Error fetching synonyms:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // GET /synonyms/:id - ดึงคำพ้องตาม ID
  // ============================================
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(`
        SELECT 
          s.SynonymID,
          s.InputWord,
          s.TargetKeywordID,
          k.KeywordText AS TargetKeyword,
          s.SimilarityScore,
          s.RoleDescription,
          s.IsActive,
          s.CreatedAt,
          s.UpdatedAt
        FROM KeywordSynonyms s
        LEFT JOIN Keywords k ON s.TargetKeywordID = k.KeywordID
        WHERE s.SynonymID = ?
      `, [id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบคำพ้องที่ระบุ' });
      }
      
      res.status(200).json({ success: true, data: rows[0] });
    } catch (error) {
      console.error('❌ Error fetching synonym:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // POST /synonyms - เพิ่มคำพ้องใหม่
  // ============================================
  router.post('/', async (req, res) => {
    try {
      const { inputWord, targetKeywordId, similarityScore, roleDescription, isActive } = req.body;
      
      // Validation
      if (!inputWord || !inputWord.trim()) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุคำที่ผู้ใช้พิมพ์ (InputWord)' });
      }
      if (!targetKeywordId) {
        return res.status(400).json({ success: false, message: 'กรุณาเลือก Keyword เป้าหมาย' });
      }
      
      const score = parseFloat(similarityScore) || 0.80;
      if (score < 0 || score > 1) {
        return res.status(400).json({ success: false, message: 'คะแนนความคล้ายคลึงต้องอยู่ระหว่าง 0.00 - 1.00' });
      }
      
      // Check if keyword exists
      const [keywordCheck] = await pool.query(
        'SELECT KeywordID FROM Keywords WHERE KeywordID = ?',
        [targetKeywordId]
      );
      if (keywordCheck.length === 0) {
        return res.status(400).json({ success: false, message: 'ไม่พบ Keyword เป้าหมายในระบบ' });
      }
      
      // Check for duplicates
      const [dupCheck] = await pool.query(
        'SELECT SynonymID FROM KeywordSynonyms WHERE InputWord = ? AND TargetKeywordID = ?',
        [inputWord.trim(), targetKeywordId]
      );
      if (dupCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'คำพ้องนี้มีอยู่ในระบบแล้ว' });
      }
      
      const [result] = await pool.query(`
        INSERT INTO KeywordSynonyms (InputWord, TargetKeywordID, SimilarityScore, RoleDescription, IsActive)
        VALUES (?, ?, ?, ?, ?)
      `, [
        inputWord.trim(),
        targetKeywordId,
        score,
        roleDescription || 'คำพ้อง',
        isActive !== undefined ? (isActive ? 1 : 0) : 1
      ]);
      
      res.status(201).json({
        success: true,
        message: 'เพิ่มคำพ้องสำเร็จ',
        data: { SynonymID: result.insertId }
      });
    } catch (error) {
      console.error('❌ Error creating synonym:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'คำพ้องนี้มีอยู่ในระบบแล้ว' });
      }
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // PUT /synonyms/:id - แก้ไขคำพ้อง
  // ============================================
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { inputWord, targetKeywordId, similarityScore, roleDescription, isActive } = req.body;
      
      // Check if exists
      const [existing] = await pool.query(
        'SELECT SynonymID FROM KeywordSynonyms WHERE SynonymID = ?',
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบคำพ้องที่ระบุ' });
      }
      
      // Validation
      if (!inputWord || !inputWord.trim()) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุคำที่ผู้ใช้พิมพ์ (InputWord)' });
      }
      if (!targetKeywordId) {
        return res.status(400).json({ success: false, message: 'กรุณาเลือก Keyword เป้าหมาย' });
      }
      
      const score = parseFloat(similarityScore) || 0.80;
      if (score < 0 || score > 1) {
        return res.status(400).json({ success: false, message: 'คะแนนความคล้ายคลึงต้องอยู่ระหว่าง 0.00 - 1.00' });
      }
      
      // Check if keyword exists
      const [keywordCheck] = await pool.query(
        'SELECT KeywordID FROM Keywords WHERE KeywordID = ?',
        [targetKeywordId]
      );
      if (keywordCheck.length === 0) {
        return res.status(400).json({ success: false, message: 'ไม่พบ Keyword เป้าหมายในระบบ' });
      }
      
      // Check for duplicates (excluding current record)
      const [dupCheck] = await pool.query(
        'SELECT SynonymID FROM KeywordSynonyms WHERE InputWord = ? AND TargetKeywordID = ? AND SynonymID != ?',
        [inputWord.trim(), targetKeywordId, id]
      );
      if (dupCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'คำพ้องนี้มีอยู่ในระบบแล้ว' });
      }
      
      await pool.query(`
        UPDATE KeywordSynonyms 
        SET InputWord = ?, TargetKeywordID = ?, SimilarityScore = ?, RoleDescription = ?, IsActive = ?
        WHERE SynonymID = ?
      `, [
        inputWord.trim(),
        targetKeywordId,
        score,
        roleDescription || 'คำพ้อง',
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        id
      ]);
      
      res.status(200).json({ success: true, message: 'แก้ไขคำพ้องสำเร็จ' });
    } catch (error) {
      console.error('❌ Error updating synonym:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'คำพ้องนี้มีอยู่ในระบบแล้ว' });
      }
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // DELETE /synonyms/:id - ลบคำพ้อง
  // ============================================
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [existing] = await pool.query(
        'SELECT SynonymID FROM KeywordSynonyms WHERE SynonymID = ?',
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบคำพ้องที่ระบุ' });
      }
      
      await pool.query('DELETE FROM KeywordSynonyms WHERE SynonymID = ?', [id]);
      
      res.status(200).json({ success: true, message: 'ลบคำพ้องสำเร็จ' });
    } catch (error) {
      console.error('❌ Error deleting synonym:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  // ============================================
  // PATCH /synonyms/:id/toggle - สลับสถานะ Active/Inactive
  // ============================================
  router.patch('/:id/toggle', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [existing] = await pool.query(
        'SELECT SynonymID, IsActive FROM KeywordSynonyms WHERE SynonymID = ?',
        [id]
      );
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'ไม่พบคำพ้องที่ระบุ' });
      }
      
      const newStatus = existing[0].IsActive ? 0 : 1;
      await pool.query(
        'UPDATE KeywordSynonyms SET IsActive = ? WHERE SynonymID = ?',
        [newStatus, id]
      );
      
      res.status(200).json({
        success: true,
        message: newStatus ? 'เปิดใช้งานคำพ้องแล้ว' : 'ปิดใช้งานคำพ้องแล้ว',
        data: { IsActive: newStatus }
      });
    } catch (error) {
      console.error('❌ Error toggling synonym status:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });

  return router;
};
