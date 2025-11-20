// middleware/checkEmailVerified.js
const db = require('../config/db');

/**
 * Middleware to check if user's email is verified
 * Use this to protect routes that require email verification
 */
const checkEmailVerified = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const [users] = await db.query(
      'SELECT email_verified FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!users[0].email_verified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required. Please verify your email before performing this action.',
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    console.error('❌ Check email verified error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking email verification status'
    });
  }
};

module.exports = { checkEmailVerified };