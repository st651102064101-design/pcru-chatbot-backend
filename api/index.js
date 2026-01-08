// Vercel serverless function entry point
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 60000
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PCRU Chatbot Backend API', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public: Get negative keywords
app.get('/negativekeywords/public', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT Word
      FROM NegativeKeywords
      WHERE IsActive = 1
      ORDER BY Word
      LIMIT 50
    `);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Get public negative keywords error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public: Get synonyms
app.get('/synonyms/public', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ks.InputWord, k.KeywordText AS TargetKeyword
      FROM KeywordSynonyms ks
      LEFT JOIN Keywords k ON ks.TargetKeywordID = k.KeywordID
      WHERE ks.IsActive = 1
      LIMIT 50
    `);
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Get public synonyms error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public: Get popular questions
app.get('/questionsanswers/popular', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const [rows] = await pool.query(`
      SELECT 
        q.QuestionsAnswersID,
        q.QuestionTitle,
        COUNT(f.FeedbackID) as likeCount
      FROM QuestionsAnswers q
      LEFT JOIN ChatLogHasAnswers cl ON cl.QuestionsAnswersID = q.QuestionsAnswersID
      LEFT JOIN Feedbacks f ON f.ChatLogID = cl.ChatLogID AND f.FeedbackValue = 1
      GROUP BY q.QuestionsAnswersID, q.QuestionTitle
      HAVING likeCount > 0
      ORDER BY likeCount DESC
      LIMIT ?
    `, [limit]);
    
    res.status(200).json({ 
      success: true, 
      data: rows.map(r => ({
        id: r.QuestionsAnswersID,
        title: r.QuestionTitle,
        likeCount: r.likeCount
      }))
    });
  } catch (err) {
    console.error('Get popular questions error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Public: Get navigation questions
app.get('/questionsanswers/navigation', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const [rows] = await pool.query(`
      SELECT 
        QuestionsAnswersID,
        QuestionTitle,
        QuestionText
      FROM QuestionsAnswers 
      WHERE 
        (QuestionTitle LIKE '%พิกัด%' OR QuestionTitle LIKE '%นำทาง%' OR QuestionTitle LIKE '%ที่ตั้ง%' OR QuestionTitle LIKE '%แผนที่%')
        AND (
          QuestionText LIKE '%maps.app.goo.gl%'
          OR QuestionText LIKE '%maps.google%'
          OR QuestionText LIKE '%goo.gl/maps%'
          OR QuestionText LIKE '%google.com/maps%'
          OR QuestionText REGEXP '[0-9]+\\\\.[0-9]+,[[:space:]]*[0-9]+\\\\.[0-9]+'
        )
      ORDER BY QuestionsAnswersID DESC
      LIMIT ?
    `, [limit]);
    
    res.status(200).json({ 
      success: true, 
      data: rows.map(r => ({
        id: r.QuestionsAnswersID,
        title: r.QuestionTitle,
        hasMap: true
      }))
    });
  } catch (err) {
    console.error('Get navigation questions error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Export for Vercel
module.exports = app;
