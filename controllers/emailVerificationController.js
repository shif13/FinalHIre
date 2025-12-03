// controllers/emailVerificationController.js
const db = require('../config/db');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ==========================================
// SEND/RESEND VERIFICATION OTP
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

    // Generate 6-digit OTP
    const otp = generateOTP();
    
    // Hash OTP for storage (security)
    const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    
    // OTP expires in 10 minutes
    const otpExpiry = new Date(Date.now() + 10 * 60000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    console.log('📧 Generated OTP:', {
      userId: user.id,
      email: user.email,
      otpPreview: otp.substring(0, 3) + '***',
      expiry: otpExpiry
    });

    // Save hashed OTP to database
    await db.query(
      `UPDATE users 
       SET verification_token = ?, verification_token_expiry = ?
       WHERE id = ?`,
      [hashedOTP, otpExpiry, userId]
    );

    // Verify the OTP was saved
    const [check] = await db.query(
      'SELECT verification_token FROM users WHERE id = ?',
      [userId]
    );
    console.log('✅ OTP saved to DB:', check[0].verification_token?.substring(0, 10) + '...');

    // Send OTP email
    await emailService.sendVerificationOTPEmail(
      {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      },
      otp // Send plain OTP in email
    );

    console.log(`✅ OTP email sent to: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Verification OTP sent to your email. Valid for 10 minutes.'
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending verification OTP',
      error: error.message
    });
  }
};

// ==========================================
// VERIFY OTP (NEW ENDPOINT)
// ==========================================
const verifyOTP = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp } = req.body;

    console.log('🔍 OTP Verification attempt:', { userId, otpProvided: !!otp });

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP format. Please enter 6 digits.'
      });
    }

    // Get user with stored OTP
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, email_verified, 
              verification_token, verification_token_expiry
       FROM users 
       WHERE id = ?`,
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

    // Check if OTP exists
    if (!user.verification_token) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check if OTP expired
    const now = new Date();
    const expiry = new Date(user.verification_token_expiry);
    
    console.log('⏰ OTP expiry check:', {
      currentTime: now.toISOString(),
      expiryTime: expiry.toISOString(),
      isExpired: now > expiry,
      timeRemaining: expiry - now > 0 ? `${Math.floor((expiry - now) / 1000 / 60)} minutes` : 'expired'
    });

    if (now > expiry) {
      console.log('❌ OTP has expired');
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
        expired: true
      });
    }

    // Hash provided OTP and compare
    const hashedProvidedOTP = crypto.createHash('sha256').update(otp).digest('hex');
    
    if (hashedProvidedOTP !== user.verification_token) {
      console.log('❌ OTP mismatch for user:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please check and try again.'
      });
    }

    // OTP is valid - mark email as verified
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

    console.log(`✅ Email verified successfully for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying OTP. Please try again.',
      error: error.message
    });
  }
};

// ==========================================
// VERIFY EMAIL TOKEN (OLD METHOD - KEEP FOR BACKWARD COMPATIBILITY)
// ==========================================
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    console.log('\n🔍 ===== EMAIL VERIFICATION ATTEMPT (TOKEN) =====');
    console.log('Token received:', {
      exists: !!token,
      length: token?.length,
      preview: token?.substring(0, 10) + '...'
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
      hashedPreview: hashedToken.substring(0, 10) + '...'
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
      usersFound: users.length
    });

    if (users.length === 0) {
      console.log('❌ No user found with this token');
      
      // Check if there's a recently verified user
      const [recentlyVerified] = await db.query(
        `SELECT id, first_name, last_name, email, email_verified 
         FROM users 
         WHERE email_verified = true 
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         ORDER BY updated_at DESC 
         LIMIT 1`
      );
      
      if (recentlyVerified.length > 0) {
        console.log('✅ Found recently verified user');
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
      isExpired: now > expiry
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
  verifyOTP,
  verifyEmail, 
  checkVerificationStatus
};