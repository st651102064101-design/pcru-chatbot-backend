// services/chat/logHasAnswer.js

module.exports = (pool) => async (req, res) => {
  const notifyChatLogsUpdate = req.app.locals.notifyChatLogsUpdate;
  const body = req.body || {};
  const userQueryRaw = body.userQuery || body.UserQuery || '';
  const questionIdRaw = body.questionId || body.QuestionsAnswersID;
  const statusRaw = typeof body.status !== 'undefined' ? body.status : body.Status;
  const timestampInput = body.Timestamp || body.timestamp;

  const trimmedQuery = typeof userQueryRaw === 'string' ? userQueryRaw.trim() : '';
  const statusValue = typeof statusRaw === 'undefined' ? 1 : statusRaw;
  const parsedTimestamp = timestampInput ? new Date(timestampInput) : new Date();

  const answersId = Number.isFinite(Number(questionIdRaw)) ? Number(questionIdRaw) : null;
  if (!trimmedQuery || answersId === null) {
    return res.status(400).json({
      success: false,
      message: 'ต้องระบุ userQuery และ questionId'
    });
  }

  if (Number.isNaN(parsedTimestamp.getTime())) {
    return res.status(400).json({
      success: false,
      message: 'Timestamp ไม่อยู่ในรูปแบบที่ถูกต้อง'
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO ChatLogHasAnswers (Timestamp, UserQuery, Status, QuestionsAnswersID)
       VALUES (?, ?, ?, ?)`,
      [parsedTimestamp, trimmedQuery, statusValue, answersId]
    );

    console.log('✅ ChatLogHasAnswers created with ID:', result.insertId, 'for QA:', answersId);

    if (notifyChatLogsUpdate) {
      notifyChatLogsUpdate({
        action: 'created',
        type: 'has-answer',
        chatLogId: result.insertId,
        userQuery: trimmedQuery,
        status: statusValue,
        questionsAnswersId: answersId,
        timestamp: parsedTimestamp.toISOString()
      });
    }

    return res.status(201).json({
      success: true,
      chatLogId: result.insertId
    });
  } catch (error) {
    console.error('❌ chat/logs/has-answer error:', error && error.message);
    console.error('   SQL:', error && error.sql);
    // อย่าทำให้ UX สะดุด: ถ้าบันทึกไม่ได้ ให้ตอบกลับสำเร็จแต่แจ้งว่าไม่ได้ log
    res.status(200).json({ success: true, logged: false, message: 'Log skipped: ' + (error && error.message) });
  }
};
