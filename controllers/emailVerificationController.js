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

    console.log('📧 Generating verification token:', {
      userId: user.id,
      email: user.email,
      tokenPreview: verificationToken.substring(0, 10) + '...',
      hashedPreview: hashedToken.substring(0, 10) + '...',
      expiry: tokenExpiry
    });

    // Save token to database
    await db.query(
      `UPDATE users 
       SET verification_token = ?, verification_token_expiry = ?
       WHERE id = ?`,
      [hashedToken, tokenExpiry, userId]
    );

    // Verify the token was saved
    const [check] = await db.query(
      'SELECT verification_token FROM users WHERE id = ?',
      [userId]
    );
    console.log('✅ Token saved to DB:', check[0].verification_token?.substring(0, 10) + '...');

    // Send verification email
    await emailService.sendVerificationEmail(
      {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      verificationToken // Send UNHASHED token in email
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
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    console.log('\n🔍 ===== EMAIL VERIFICATION ATTEMPT =====');
    console.log('Token received:', {
      exists: !!token,
      length: token?.length,
      preview: token?.substring(0, 10) + '...',
      full: token // Log full token for debugging (remove in production)
    });

    if (!token) {
      console.log('❌ No token provided');
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Hash the token to compare with database
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    console.log('🔐 Token hashing:', {
      originalPreview: token.substring(0, 10) + '...',
      hashedPreview: hashedToken.substring(0, 10) + '...',
      hashedFull: hashedToken // Log full hash for debugging (remove in production)
    });

    // Find user with this token
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, email_verified, 
              verification_token, verification_token_expiry
       FROM users 
       WHERE verification_token = ?`,
      [hashedToken]
    );

    console.log('📊 Database query result:', {
      usersFound: users.length,
      query: 'SELECT ... WHERE verification_token = ?'
    });

    if (users.length > 0) {
      console.log('✅ User found:', {
        id: users[0].id,
        email: users[0].email,
        emailVerified: users[0].email_verified,
        tokenInDb: users[0].verification_token?.substring(0, 10) + '...',
        tokenExpiry: users[0].verification_token_expiry
      });
    } else {
      console.log('❌ No user found with this token');
      
      // Additional debugging - check if any tokens exist
      const [allTokens] = await db.query(
        'SELECT id, email, verification_token FROM users WHERE verification_token IS NOT NULL LIMIT 5'
      );
      console.log('📋 Sample of tokens in database:', 
        allTokens.map(u => ({
          id: u.id,
          email: u.email,
          tokenPreview: u.verification_token?.substring(0, 10) + '...'
        }))
      );
    }

    if (users.length === 0) {
      // Check if there's a recently verified user (token was cleared after verification)
      const [recentlyVerified] = await db.query(
        `SELECT id, first_name, last_name, email, email_verified 
         FROM users 
         WHERE email_verified = true 
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY updated_at DESC 
         LIMIT 1`
      );
      
      if (recentlyVerified.length > 0) {
        console.log('✅ Found recently verified user, likely double request');
        return res.status(200).json({
          success: true,
          message: 'Email already verified',
          alreadyVerified: true,
          user: {
            firstName: recentlyVerified[0].first_name,
            lastName: recentlyVerified[0].last_name,
            email: recentlyVerified[0].email
          }
        });
      }
      
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
      currentTime: now.toISOString(),
      expiryTime: expiry.toISOString(),
      isExpired: now > expiry,
      timeRemaining: expiry - now > 0 ? `${Math.floor((expiry - now) / 1000 / 60)} minutes` : 'expired'
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
    console.log('🔄 Updating user verification status...');
    const [updateResult] = await db.query(
      `UPDATE users 
       SET email_verified = true, 
           verification_token = NULL, 
           verification_token_expiry = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [user.id]
    );

    console.log('✅ Update result:', {
      affectedRows: updateResult.affectedRows,
      changedRows: updateResult.changedRows
    });

    // Verify the update
    const [verifyUpdate] = await db.query(
      'SELECT email_verified FROM users WHERE id = ?',
      [user.id]
    );
    console.log('✅ Verification status after update:', verifyUpdate[0].email_verified);

    console.log(`✅ Email verified successfully for user: ${user.email}`);
    console.log('===== VERIFICATION COMPLETE =====\n');

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
    console.error('Error stack:', error.stack);
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