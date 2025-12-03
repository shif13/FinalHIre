// routes/emailVerificationRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  sendVerificationEmail,
  verifyOTP,
  verifyEmail,
  checkVerificationStatus
} = require('../controllers/emailVerificationController');

// POST /api/email-verification/send - Send/resend OTP (protected)
router.post('/send', authenticateToken, sendVerificationEmail);

// POST /api/email-verification/verify-otp - Verify OTP (NEW - protected)
router.post('/verify-otp', authenticateToken, verifyOTP);

// GET /api/email-verification/verify/:token - Verify email with token (OLD - public)
router.get('/verify/:token', verifyEmail);

// GET /api/email-verification/status - Check verification status (protected)
router.get('/status', authenticateToken, checkVerificationStatus);

module.exports = router;