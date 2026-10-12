const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const signToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign(
    { userId: user.user_id, username: user.username, role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendError(res, 400, 'Username and password are required.');
    }

    const result = await db.query(
      `SELECT user_id, username, role, password_hash, status
       FROM user_account
       WHERE username = $1 AND status = 'active'`,
      [username]
    );

    if (!result.rows.length) {
      return sendError(res, 401, 'Invalid username or password.');
    }

    const user = result.rows[0];
    const valid = await db.query(
      `SELECT crypt($1, $2) = $2 AS valid_password`,
      [password, user.password_hash]
    );

    if (!valid.rows[0].valid_password) {
      return sendError(res, 401, 'Invalid username or password.');
    }

    const token = signToken(user);

    return sendSuccess(res, 200, {
      token,
      user: {
        id: user.user_id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    return sendSuccess(res, 200, { user: req.user });
  } catch (error) {
    next(error);
  }
};
