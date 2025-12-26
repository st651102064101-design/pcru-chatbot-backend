/**
 * Service to add a new stopword
 * Checks for duplicates before inserting
 */
const addStopwordService = (pool) => async (req, res) => {
  try {
    const { stopword } = req.body;

    if (!stopword || typeof stopword !== 'string' || stopword.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุ stopword ที่ต้องการเพิ่ม' 
      });
    }

    const cleanStopword = stopword.trim().toLowerCase();

    // Check if stopword already exists
    const [existing] = await pool.query(
      `SELECT StopwordID FROM Stopwords WHERE StopwordText = ?`,
      [cleanStopword]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Stopword นี้มีอยู่ในระบบแล้ว' 
      });
    }

    // Insert new stopword
    const [result] = await pool.query(
      `INSERT INTO Stopwords (StopwordText) VALUES (?)`,
      [cleanStopword]
    );

    res.status(201).json({ 
      success: true, 
      message: 'เพิ่ม stopword สำเร็จ',
      data: {
        id: result.insertId,
        stopword: cleanStopword
      }
    });
  } catch (error) {
    console.error('❌ Error adding stopword:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = addStopwordService;
