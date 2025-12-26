// services/chat/logNoAnswer.js

module.exports = (pool) => async (req, res) => {
  const notifyChatLogsUpdate = req.app.locals.notifyChatLogsUpdate;
  const body = req.body || {};
  const userQueryRaw = body.userQuery || body.UserQuery || '';
  const statusRaw = typeof body.status !== 'undefined' ? body.status : body.Status;
  const timestampInput = body.Timestamp || body.timestamp; // accept PascalCase

  const trimmedQuery = typeof userQueryRaw === 'string' ? userQueryRaw.trim() : '';
  const statusValue = typeof statusRaw === 'undefined' ? 'no-answer' : statusRaw;
  const parsedTimestamp = timestampInput ? new Date(timestampInput) : new Date();

  if (!trimmedQuery) {
    return res.status(400).json({
      success: false,
      message: 'ต้องระบุ userQuery'
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
      `INSERT INTO ChatLogNoAnswers (Timestamp, UserQuery, Status)
       VALUES (?, ?, ?)`,
      [parsedTimestamp, trimmedQuery, statusValue]
    );

    if (notifyChatLogsUpdate) {
      notifyChatLogsUpdate({
        action: 'created',
        type: 'no-answer',
        chatLogId: result.insertId,
        userQuery: trimmedQuery,
        status: statusValue,
        timestamp: parsedTimestamp.toISOString()
      });
    }

    return res.status(201).json({
      success: true,
      chatLogId: result.insertId
    });
  } catch (error) {
    console.error('chat/logs/no-answer error:', error && error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};
