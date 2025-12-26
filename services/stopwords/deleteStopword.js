/**
 * Service to delete a stopword
 */
const deleteStopwordService = (pool) => async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุ ID ของ stopword ที่ต้องการลบ' 
      });
    }

    const [result] = await pool.query(
      `DELETE FROM Stopwords WHERE StopwordID = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบ stopword ที่ต้องการลบ' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'ลบ stopword สำเร็จ' 
    });
  } catch (error) {
    console.error('❌ Error deleting stopword:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = deleteStopwordService;
