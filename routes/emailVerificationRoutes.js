// routes/emailVerificationRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  sendVerificationEmail,
  verifyEmail,
  checkVerificationStatus
} = require('../controllers/emailVerificationController');

// POST /api/email-verification/send - Send/resend verification email (protected)
router.post('/send', authenticateToken, sendVerificationEmail);

// GET /api/email-verification/verify/:token - Verify email with token (public)
router.get('/verify/:token', verifyEmail);

// GET /api/email-verification/status - Check verification status (protected)
router.get('/status', authenticateToken, checkVerificationStatus);

module.exports = router;