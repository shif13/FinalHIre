// controllers/emailVerificationController.js
const db = require('../config/db');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// ==========================================
// SEND/RESEND VERIFICATION EMAIL
// ==========================================
const sendVerificationEmail = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

    // Get user details
    const [users] = await db.query(
      'SELECT id, first_name, last_name, email, email_verified FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    
    // Format date for MySQL: 'YYYY-MM-DD HH:MM:SS'
    const tokenExpiry = new Date(Date.now() + 24 * 3600000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    // Save token to database
    await db.query(
      `UPDATE users 
       SET verification_token = ?, verification_token_expiry = ?
       WHERE id = ?`,
      [hashedToken, tokenExpiry, userId]
    );

    // Send verification email
    await emailService.sendVerificationEmail(
      {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      verificationToken
    );

    console.log(`✅ Verification email sent to: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully. Please check your inbox.'
    });

  } catch (error) {
    console.error('❌ Send verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification email',
      error: error.message
    });
  }
};

// ==========================================
// VERIFY EMAIL TOKEN (NO AUTH REQUIRED)
// ==========================================
// VERIFY EMAIL TOKEN (NO AUTH REQUIRED)
// Replace the verifyEmail function in emailVerificationController.js

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    console.log('🔍 Verification attempt with token:', token?.substring(0, 10) + '...');

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    console.log('🔐 Looking for hashed token in database...');

    // Find user with this token
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, email_verified, verification_token_expiry
       FROM users 
       WHERE verification_token = ?`,
      [hashedToken]
    );

    console.log('📊 Query result:', users.length > 0 ? 'User found' : 'No user found');

    if (users.length === 0) {
      console.log('❌ No user found with this token');
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token. The link may be incorrect or already used.'
      });
    }

    const user = users[0];

    // Check if token has expired
    const now = new Date();
    const expiry = new Date(user.verification_token_expiry);
    
    console.log('⏰ Token expiry check:', {
      now: now.toISOString(),
      expiry: expiry.toISOString(),
      expired: now > expiry
    });

    if (now > expiry) {
      console.log('❌ Token has expired');
      return res.status(400).json({
        success: false,
        message: 'Verification link has expired. Please request a new verification email.',
        expired: true
      });
    }

    // Check if already verified
    if (user.email_verified) {
      console.log('✅ Email already verified');
      return res.status(200).json({
        success: true,
        message: 'Email already verified',
        alreadyVerified: true,
        user: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email
        }
      });
    }

    // Mark email as verified
    await db.query(
      `UPDATE users 
       SET email_verified = true, 
           verification_token = NULL, 
           verification_token_expiry = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [user.id]
    );

    console.log(`✅ Email verified successfully for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('❌ Email verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying email. Please try again or contact support.',
      error: error.message
    });
  }
};

// ==========================================
// CHECK VERIFICATION STATUS
// ==========================================
const checkVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.userId; // From auth middleware

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

    res.status(200).json({
      success: true,
      emailVerified: users[0].email_verified
    });

  } catch (error) {
    console.error('❌ Check verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking verification status',
      error: error.message
    });
  }
};

module.exports = {
  sendVerificationEmail,
  verifyEmail,
  checkVerificationStatus
};