const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendError } = require('../utils/response');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 401, 'Authentication required.');
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return sendError(res, 500, 'JWT secret is not configured.');
    }

    const decoded = jwt.verify(token, secret);
    const result = await db.query(
      'SELECT user_id, username, role, status FROM user_account WHERE user_id = $1',
      [decoded.userId]
    );

    if (!result.rows.length || result.rows[0].status !== 'active') {
      return sendError(res, 401, 'Invalid or inactive account.');
    }

    req.user = {
      id: result.rows[0].user_id,
      username: result.rows[0].username,
      role: result.rows[0].role,
    };
    next();
  } catch (err) {
    return sendError(res, 401, 'Invalid or expired token.');
  }
};

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return sendError(res, 401, 'Authentication required.');
  if (!allowedRoles.includes(req.user.role)) {
    return sendError(res, 403, 'You do not have permission to perform this action.');
  }
  next();
};

module.exports = { protect, authorize };
