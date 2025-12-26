// middleware/auth.js

const jwt = require('jsonwebtoken');

// Store for tracking last activity time (userId -> timestamp)
const lastActivityMap = new Map();

/**
 * Helper function to convert time string to milliseconds
 * Supports formats like '1h', '30m', '15m', '10s'
 */
function parseTimeToMs(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/^(\d+)([smh])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 0;
  }
}

/**
 * Middleware to authenticate JWT token from Authorization header.
 * If the token is valid, it attaches the decoded user payload to req.user.
 * Also checks for idle timeout and session timeout.
 * If not, it sends a 401 or 403 response.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // The header format is "Bearer TOKEN"
    // Allow CORS preflight requests (OPTIONS) to proceed without requiring a token
    if (req.method === 'OPTIONS') return next();

    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        // No token provided
        return res.status(401).json({ success: false, message: 'Unauthorized: Access token is required.' });
    }

    // เพิ่มการตรวจสอบเพื่อให้แน่ใจว่า JWT_SECRET ถูกโหลดมาอย่างถูกต้อง
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error('CRITICAL ERROR: JWT_SECRET is not available for token verification.');
        return res.status(500).json({ success: false, message: 'Internal Server Error: Server configuration issue.' });
    }

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            // Token is invalid (expired, malformed, etc.)
            return res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired token.' });
        }

        // === Check Idle Timeout ===
        const idleTimeoutStr = process.env.IDLE_TIMEOUT || '15m';
        const idleTimeoutMs = parseTimeToMs(idleTimeoutStr);
        const userId = user.userId;
        const now = Date.now();
        const lastActivity = lastActivityMap.get(userId) || user.iat * 1000;

        if (idleTimeoutMs > 0 && (now - lastActivity) > idleTimeoutMs) {
            console.log(`⏱️  Idle timeout triggered for user ${userId} (idle for ${Math.round((now - lastActivity) / 1000)}s)`);
            // Clear the idle tracking for this user
            lastActivityMap.delete(userId);
            return res.status(401).json({ 
                success: false, 
                message: 'Session expired due to inactivity.',
                code: 'IDLE_TIMEOUT'
            });
        }

        // === Check Session Timeout ===
        const sessionTimeoutStr = process.env.SESSION_TIMEOUT || '24h';
        const sessionTimeoutMs = parseTimeToMs(sessionTimeoutStr);
        const loginTime = user.iat * 1000; // JWT iat is in seconds

        if (sessionTimeoutMs > 0 && (now - loginTime) > sessionTimeoutMs) {
            console.log(`⏱️  Session timeout triggered for user ${userId} (logged in for ${Math.round((now - loginTime) / 1000 / 60)}m)`);
            // Clear the idle tracking for this user
            lastActivityMap.delete(userId);
            return res.status(401).json({ 
                success: false, 
                message: 'Session expired. Please login again.',
                code: 'SESSION_TIMEOUT'
            });
        }

        // Update last activity time
        lastActivityMap.set(userId, now);

        // Attach user payload to the request object for later use
        req.user = user;
        
        // Proceed to the next middleware or route handler
        next();
    });
}

module.exports = authenticateToken;