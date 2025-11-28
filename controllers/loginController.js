const db = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Email configuration
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate JWT token
const generateToken = (userId, email, userType) => {
  return jwt.sign(
    { userId, email, userType },
    process.env.JWT_SECRET || 'your-secret-key-change-this',
    { expiresIn: '7d' }
  );
};

// Login - INDEPENDENT PASSWORDS PER ROLE
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    // Get ALL accounts with this email
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, password, mobile_number, whatsapp_number, 
              location, user_type, is_active, email_verified
       FROM users WHERE email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password against ALL accounts and collect matching roles
    const matchingAccounts = [];
    
    for (const user of users) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (isPasswordValid && user.is_active) {
        matchingAccounts.push(user);
      }
    }

    // No matching accounts with this password
    if (matchingAccounts.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // If multiple roles match, return them for selection
    if (matchingAccounts.length > 1) {
      const roles = matchingAccounts.map(acc => acc.user_type);
      const tokens = {};
      
      // Generate a token for each matching role
      matchingAccounts.forEach(account => {
        tokens[account.user_type] = generateToken(account.id, account.email, account.user_type);
      });

      const firstAccount = matchingAccounts[0];

      return res.status(200).json({
        success: true,
        message: 'Multiple accounts found',
        roles: roles,
        tokens: tokens,
        user: {
          id: firstAccount.id,
          first_name: firstAccount.first_name,
          last_name: firstAccount.last_name,
          email: firstAccount.email,
          mobile_number: firstAccount.mobile_number,
          whatsapp_number: firstAccount.whatsapp_number,
          location: firstAccount.location,
          email_verified: firstAccount.email_verified
        }
      });
    }

    // Single matching role - proceed normally
    const user = matchingAccounts[0];

    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    const token = generateToken(user.id, user.email, user.user_type);
    delete user.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        mobile_number: user.mobile_number,
        whatsapp_number: user.whatsapp_number,
        location: user.location,
        user_type: user.user_type,
        email_verified: user.email_verified
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

// Forgot Password - WITH ROLE SELECTION
const forgotPassword = async (req, res) => {
  const { email, role } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // First, check all accounts with this email
    const [allAccounts] = await db.query(
      'SELECT id, first_name, last_name, email, user_type, is_active FROM users WHERE email = ? AND is_active = true',
      [email]
    );

    // If no accounts found, return generic success message (security best practice)
    if (allAccounts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      });
    }

    // If multiple accounts exist and no role specified, ask user to select role
    if (allAccounts.length > 1 && !role) {
      return res.status(200).json({
        success: true,
        requiresRole: true,
        roles: allAccounts.map(acc => acc.user_type),
        message: 'Multiple accounts found. Please select which account to reset.'
      });
    }

    // Get the specific account
    let targetUser;
    if (role) {
      targetUser = allAccounts.find(acc => acc.user_type === role);
      if (!targetUser) {
        return res.status(200).json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        });
      }
    } else {
      targetUser = allAccounts[0];
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Update only the specific account with the reset token
    await db.query(
      `UPDATE users 
       SET reset_token = ?, reset_token_expiry = ?
       WHERE id = ?`,
      [hashedToken, resetTokenExpiry, targetUser.id]
    );

    // Send email with the plain token (not hashed)
    const roleNames = {
      'manpower': 'Freelancer',
      'equipment_owner': 'Equipment Supplier',
      'consultant': 'Manpower Supplier'
    };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: targetUser.email,
      subject: `Password Reset Request - ${roleNames[targetUser.user_type] || 'Find-Hire.Co'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0d9488; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .token-box { 
              background-color: #fff; 
              border: 2px solid #0d9488; 
              padding: 20px; 
              margin: 20px 0; 
              border-radius: 8px;
              text-align: center;
            }
            .token { 
              font-size: 24px; 
              font-weight: bold; 
              color: #0d9488; 
              letter-spacing: 2px;
              word-break: break-all;
            }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
            .role-badge { background-color: #0d9488; color: white; padding: 5px 15px; border-radius: 15px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${targetUser.first_name} ${targetUser.last_name}</strong>,</p>
              <p>We received a request to reset your password for your <strong>${roleNames[targetUser.user_type]}</strong> account.</p>
              <div style="text-align: center;">
                <span class="role-badge">${roleNames[targetUser.user_type]} Account</span>
              </div>
              
              <p>Please use the following token to reset your password:</p>
              
              <div class="token-box">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Your Reset Token:</p>
                <div class="token">${resetToken}</div>
              </div>

              <p style="text-align: center; color: #dc2626; font-weight: bold;">⏰ This token will expire in 1 hour.</p>

              <p><strong>How to reset your password:</strong></p>
              <ol>
                <li>Go to the login page</li>
                <li>Click "Forgot password?"</li>
                <li>Enter your email and select your account type</li>
                <li>Copy and paste the token above</li>
                <li>Create your new password</li>
              </ol>

              <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
              <p><em>Note: This will only reset the password for your ${roleNames[targetUser.user_type]} account. Other account types (if any) will remain unchanged.</em></p>
            </div>
            <div class="footer">
              <p>© 2025 Find-Hire.Co. All rights reserved.</p>
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'Password reset token has been sent to your email.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending password reset email',
      error: error.message
    });
  }
};

// Verify Reset Token
const verifyResetToken = async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Reset token is required'
    });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const [users] = await db.query(
      `SELECT id, email, first_name, last_name, user_type
       FROM users 
       WHERE reset_token = ? 
       AND reset_token_expiry > NOW()
       AND is_active = true
       LIMIT 1`,
      [hashedToken]
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const roleNames = {
      'manpower': 'Freelancer',
      'equipment_owner': 'Equipment Supplier',
      'consultant': 'Manpower Supplier'
    };

    res.status(200).json({
      success: true,
      message: 'Valid reset token',
      email: users[0].email,
      accountType: roleNames[users[0].user_type] || users[0].user_type
    });

  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying reset token',
      error: error.message
    });
  }
};

// Reset Password - ONLY FOR SPECIFIC ACCOUNT
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Token, password, and confirm password are required'
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const [users] = await db.query(
      `SELECT id, email, first_name, last_name, user_type
       FROM users 
       WHERE reset_token = ? 
       AND reset_token_expiry > NOW()
       AND is_active = true
       LIMIT 1`,
      [hashedToken]
    );

    if (users.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const user = users[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password for ONLY this specific account (by ID)
    await db.query(
      `UPDATE users 
       SET password = ?, 
           reset_token = NULL, 
           reset_token_expiry = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    const roleNames = {
      'manpower': 'Freelancer',
      'equipment_owner': 'Equipment Supplier',
      'consultant': 'Manpower Supplier'
    };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `Password Changed Successfully - ${roleNames[user.user_type]}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0d9488; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; }
            .role-badge { background-color: #0d9488; color: white; padding: 5px 15px; border-radius: 15px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Password Changed Successfully</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${user.first_name} ${user.last_name}</strong>,</p>
              <p>Your password has been changed successfully for your <strong>${roleNames[user.user_type]}</strong> account.</p>
              <div style="text-align: center;">
                <span class="role-badge">${roleNames[user.user_type]} Account</span>
              </div>
              <p>If you didn't make this change, please contact our support team immediately.</p>
              <p>You can now log in with your new password.</p>
              <p><em>Note: This change only affects your ${roleNames[user.user_type]} account. If you have other account types with the same email, their passwords remain unchanged.</em></p>
            </div>
            <div class="footer">
              <p>© 2025 Find-Hire.Co. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
};

// Change Password - ONLY FOR LOGGED-IN ACCOUNT
const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.user.userId;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'All password fields are required'
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'New passwords do not match'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long'
    });
  }

  try {
    const [users] = await db.query(
      'SELECT id, email, first_name, last_name, password, user_type FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password for ONLY this specific account (by ID)
    await db.query(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, user.id]
    );

    const roleNames = {
      'manpower': 'Freelancer',
      'equipment_owner': 'Equipment Supplier',
      'consultant': 'Manpower Supplier'
    };

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `Password Changed - ${roleNames[user.user_type]}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body>
          <h2>Password Changed</h2>
          <p>Hi ${user.first_name} ${user.last_name},</p>
          <p>Your password has been changed successfully for your <strong>${roleNames[user.user_type]}</strong> account.</p>
          <p>If you didn't make this change, please contact support immediately.</p>
          <p><em>Note: This only affects your ${roleNames[user.user_type]} account password.</em></p>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully for this account'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: error.message
    });
  }
};

// Logout
const logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
};

// Add this NEW function to controllers/loginController.js

// Login WITH ROLE CHECK - NEW ENDPOINT
const loginWithRole = async (req, res) => {
  const { email, password, requestedRole } = req.body;

  if (!email || !password || !requestedRole) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, and role are required'
    });
  }

  try {
    // Get user account for the REQUESTED ROLE ONLY
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, password, mobile_number, whatsapp_number, 
              location, user_type, is_active, email_verified
       FROM users 
       WHERE email = ? AND user_type = ?`,
      [email, requestedRole]
    );

    // No account found for this role
    if (users.length === 0) {
      // Check if user exists with OTHER roles
      const [otherAccounts] = await db.query(
        'SELECT user_type FROM users WHERE email = ?',
        [email]
      );

      if (otherAccounts.length > 0) {
        // User exists but not for requested role
        return res.status(403).json({
          success: false,
          noAccountForRole: true,
          message: `You don't have an account for this role`,
          existingRoles: otherAccounts.map(acc => acc.user_type)
        });
      }

      // User doesn't exist at all
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = users[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Generate token
    const token = generateToken(user.id, user.email, user.user_type);
    delete user.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        mobile_number: user.mobile_number,
        whatsapp_number: user.whatsapp_number,
        location: user.location,
        user_type: user.user_type,
        email_verified: user.email_verified
      }
    });

  } catch (error) {
    console.error('Login with role error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
};

module.exports = {
  login,
  loginWithRole,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  changePassword,
  logout
};