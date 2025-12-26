// services/chat/feedback.js
// Quality guard removed

// 📋 Valid feedback reasons for negative feedback
const VALID_FEEDBACK_REASONS = [
  'wrong_answer',      // คำตอบไม่ถูกต้อง
  'incomplete',        // ข้อมูลไม่ครบถ้วน
  'outdated',          // ข้อมูลล้าสมัย
  'not_relevant',      // ไม่เกี่ยวข้องกับคำถาม
  'confusing',         // เข้าใจยาก/สับสน
  'too_long',          // ยาวเกินไป
  'too_short',         // สั้นเกินไป
  'wrong_format',      // รูปแบบไม่ถูกต้อง
  'missing_details',   // ขาดรายละเอียดสำคัญ
  'other'              // อื่นๆ
];

module.exports = (pool) => async (req, res) => {
  const notifyFeedbackUpdate = req.app.locals.notifyFeedbackUpdate;
  
  const {
    chatLogId,
    value,
    feedbackValue: rawFeedbackValue,
    message,
    rating,
    liked,
    questionId,
    // 🆕 Additional fields for learning
    query,           // Original user query
    selectedQAId,    // QA that user selected/clicked
    wasHelpful,      // Boolean: was this result helpful?
    // 🛡️ Fields for quality guard learning
    botResponse,     // The response that chatbot gave
    expectedAnswer,  // What user expected (optional)
    wrongReason,     // Why it was wrong: 'wrong_domain', 'irrelevant', 'incomplete', 'outdated'
    // 📋 New fields for feedback reason
    feedbackReason,  // Reason code from dropdown
    feedbackComment  // Optional comment from user
  } = req.body || {};

  // Map payload to integer FeedbackValue to satisfy DB schema
  // Priority: liked (boolean -> 1/0), else numeric rating, else numeric value/rawFeedbackValue
  let feedbackInt = null;
  if (typeof liked !== 'undefined') {
    feedbackInt = liked ? 1 : 0;
  } else if (Number.isFinite(Number(rating))) {
    feedbackInt = Number(rating);
  } else if (Number.isFinite(Number(value))) {
    feedbackInt = Number(value);
  } else if (Number.isFinite(Number(rawFeedbackValue))) {
    feedbackInt = Number(rawFeedbackValue);
  }

  if (feedbackInt === null) {
    return res.status(400).json({ success: false, message: 'ต้องระบุ liked หรือ rating (ตัวเลข) หรือ value เป็นตัวเลข' });
  }

  // Validate feedback reason if provided
  const validReason = feedbackReason && VALID_FEEDBACK_REASONS.includes(feedbackReason) ? feedbackReason : null;
  const sanitizedComment = feedbackComment ? String(feedbackComment).slice(0, 500) : null;

  const chatLogIdValue = Number.isFinite(Number(chatLogId)) ? Number(chatLogId) : null;

  try {
    // 🧠 AUTO-LEARN: Learn from user feedback (positive feedback = helpful result)
    const isPositiveFeedback = feedbackInt >= 1 || liked === true || wasHelpful === true;
    const isNegativeFeedback = feedbackInt === 0 || liked === false || wasHelpful === false;
    
    // Quality guard learning removed
    
    // ถ้ามี chatLogId ให้ตรวจสอบว่ามี feedback อยู่แล้วหรือไม่
    if (chatLogIdValue !== null) {
      const [existing] = await pool.query(
        `SELECT FeedbackID FROM Feedbacks WHERE ChatLogID = ? LIMIT 1`,
        [chatLogIdValue]
      );

      if (existing.length > 0) {
        // มี feedback อยู่แล้ว ให้ UPDATE (พร้อม reason และ comment ถ้ามี)
        await pool.query(
          `UPDATE Feedbacks SET FeedbackValue = ?, FeedbackReason = ?, FeedbackComment = ?, Timestamp = NOW() WHERE ChatLogID = ?`,
          [feedbackInt, validReason, sanitizedComment, chatLogIdValue]
        );
        
        // แจ้งเตือน clients ทั้งหมด
        console.log('🔔 Feedback UPDATED - calling notifyFeedbackUpdate');
        if (notifyFeedbackUpdate) {
          notifyFeedbackUpdate({ 
            feedbackId: existing[0].FeedbackID, 
            action: 'updated', 
            chatLogId: chatLogIdValue, 
            feedbackValue: feedbackInt,
            feedbackReason: validReason,
            feedbackComment: sanitizedComment
          });
        } else {
          console.warn('⚠️ notifyFeedbackUpdate not available');
        }
        
        return res.status(200).json({ success: true, feedbackId: existing[0].FeedbackID, updated: true });
      }
    }

    // ไม่มี feedback หรือไม่มี chatLogId ให้ INSERT ใหม่
    // Skip insert if no chatLogId (DB requires it as foreign key)
    if (chatLogIdValue === null) {
      console.log('⚠️ Feedback received but no chatLogId - skipping DB insert', { feedbackInt, validReason, sanitizedComment, botResponse });
      return res.status(200).json({ 
        success: true, 
        message: 'Feedback received (not stored - no chatLogId)', 
        stored: false,
        reason: validReason,
        comment: sanitizedComment
      });
    }
    
    // ตรวจสอบว่า ChatLogID มีอยู่ใน ChatLogHasAnswers หรือไม่
    const [chatLogExists] = await pool.query(
      `SELECT ChatLogID, QuestionsAnswersID FROM ChatLogHasAnswers WHERE ChatLogID = ? LIMIT 1`,
      [chatLogIdValue]
    );
    
    if (chatLogExists.length === 0) {
      console.log('⚠️ Feedback: ChatLogID does not exist (expired/deleted):', chatLogIdValue);
      
      // ไม่สร้าง ChatLog ใหม่ เพราะถ้า user กด like/unlike ไปมา จะสร้างซ้ำเรื่อย
      // แค่รับ feedback แต่ไม่บันทึก
      return res.status(200).json({ 
        success: true, 
        message: 'Feedback received but ChatLog expired - not stored', 
        stored: false,
        chatLogId: chatLogIdValue,
        reason: 'ChatLog expired or deleted by retention policy'
      });
    }
    
    const [result] = await pool.query(
      `INSERT INTO Feedbacks (FeedbackValue, FeedbackReason, FeedbackComment, ChatLogID, Timestamp)
       VALUES (?, ?, ?, ?, NOW())`,
      [feedbackInt, validReason, sanitizedComment, chatLogIdValue]
    );
    
    // แจ้งเตือน clients ทั้งหมด
    console.log('🔔 Feedback CREATED - calling notifyFeedbackUpdate');
    if (notifyFeedbackUpdate) {
      notifyFeedbackUpdate({ 
        feedbackId: result.insertId, 
        action: 'created', 
        chatLogId: chatLogIdValue, 
        feedbackValue: feedbackInt,
        feedbackReason: validReason,
        feedbackComment: sanitizedComment
      });
    } else {
      console.warn('⚠️ notifyFeedbackUpdate not available');
    }

    return res.status(201).json({ success: true, feedbackId: result.insertId });
  } catch (error) {
    console.error('❌ chat/feedback error:', error);
    console.error('   Stack:', error && error.stack);
    console.error('   Message:', error && error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error && error.message });
  }
};

// Export valid reasons for frontend reference
module.exports.VALID_FEEDBACK_REASONS = VALID_FEEDBACK_REASONS;
