const db = require('../config/db');
const bcrypt = require('bcrypt');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const crypto = require('crypto');
const { createUser, checkEmailRoleExists } = require('./userController');
const emailService = require('../services/emailService');

// ==========================================
// CREATE CONSULTANT_PROFILES TABLE
// ==========================================
const createConsultantProfilesTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS consultant_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      location VARCHAR(255) NOT NULL,
      company_name VARCHAR(255),
      profile_photo VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_email (email),
      INDEX idx_location (location),
      INDEX idx_company (company_name)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Consultant profiles table created or already exists');
  } catch (error) {
    console.error('❌ Error creating consultant profiles table:', error);
    throw error;
  }
};

// ==========================================
// UPDATE USERS TABLE - Add 'consultant' to user_type ENUM
// ==========================================
const updateUsersTableForConsultant = async () => {
  try {
    // Check current ENUM values
    const [columns] = await db.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'user_type'
    `);

    if (columns.length > 0) {
      const columnType = columns[0].COLUMN_TYPE;
      
      // Check if 'consultant' already exists
      if (!columnType.includes('consultant')) {
        console.log('🔄 Adding consultant to user_type ENUM...');
        
        await db.query(`
          ALTER TABLE users 
          MODIFY COLUMN user_type ENUM('manpower', 'equipment_owner', 'both', 'consultant') NOT NULL
        `);
        
        console.log('✅ Users table updated with consultant user type');
      } else {
        console.log('✅ Consultant user type already exists in users table');
      }
    }
  } catch (error) {
    console.error('❌ Error updating users table:', error);
    // Don't throw - allow app to continue if this fails
  }
};

// ==========================================
// INITIALIZE TABLES ON MODULE LOAD
// ==========================================
(async () => {
  try {
    await createConsultantProfilesTable();
    await updateUsersTableForConsultant();
  } catch (error) {
    console.error('Failed to initialize consultant tables:', error);
  }
})();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Upload image to Cloudinary
const uploadToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'consultant_profiles',
      resource_type: 'image',
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ]
    });
    
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Delete from Cloudinary
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return;
    
    const matches = imageUrl.match(/\/consultant_profiles\/([^\.]+)/);
    if (matches && matches[1]) {
      const publicId = `consultant_profiles/${matches[1]}`;
      await cloudinary.uploader.destroy(publicId);
      console.log('🗑️ Deleted image from Cloudinary:', publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// Delete local file
const deleteLocalFile = (filename) => {
  try {
    if (!filename) return;
    
    const path = require('path');
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('🗑️ Deleted local file:', filename);
    }
  } catch (error) {
    console.error('Error deleting local file:', error);
  }
};

// ==========================================
// CREATE CONSULTANT ACCOUNT (SIGNUP)
// ==========================================
const createConsultantAccount = async (req, res) => {
  console.log('🎯 createConsultantAccount called');
  console.log('📦 Body:', req.body);
  console.log('📎 Files:', req.files);

  try {
    const {
      name,
      email,
      password,
      location,
      mobileNumber,
      whatsappNumber,
      companyName
    } = req.body;

    // Validation
    if (!name || !email || !password || !mobileNumber || !location) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (name, email, password, mobile, location)'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if email exists with 'consultant' role
    const emailRoleExists = await checkEmailRoleExists(email, 'consultant');
    if (emailRoleExists) {
      return res.status(400).json({
        success: false,
        message: 'You already have a Manpower Supplier account with this email. Please login or use a different email.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle profile photo upload
    let profilePhotoUrl = null;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        console.log('📸 Uploading profile photo to Cloudinary...');
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path);
        console.log('✅ Profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
      }
    }

    // Auto-fill WhatsApp with mobile if not provided
    const finalWhatsappNumber = whatsappNumber || mobileNumber;

    // Split name into first and last name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name;
    const lastName = nameParts.slice(1).join(' ') || '';

    // Step 1: Create user in users table
    console.log('👤 Creating user in users table...');
    const userResult = await createUser({
      first_name: firstName,
      last_name: lastName,
      email,
      password: hashedPassword,
      mobile_number: mobileNumber,
      whatsapp_number: finalWhatsappNumber,
      location,
      user_type: 'consultant'
    });

    const userId = userResult.userId;
    console.log('✅ User created with ID:', userId);

    // Step 2: Create consultant profile
    console.log('🏢 Creating consultant profile...');
    await db.query(
      `INSERT INTO consultant_profiles 
      (user_id, name, email, mobile_number, whatsapp_number, location, company_name, profile_photo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        name,
        email,
        mobileNumber,
        finalWhatsappNumber,
        location,
        companyName || null,
        profilePhotoUrl
      ]
    );

    console.log(`✅ Consultant account created: ${email} (User ID: ${userId})`);

    try {
      // Generate verification token
      const crypto = require('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
      
      const tokenExpiry = new Date(Date.now() + 24 * 3600000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      console.log('🔐 Generated verification token for user:', userId);
      console.log('📅 Token expiry:', tokenExpiry);

      // Save token to database (keep await - this is fast)
      await db.query(
        `UPDATE users 
         SET verification_token = ?, verification_token_expiry = ?
         WHERE id = ?`,
        [hashedToken, tokenExpiry, userId]
      );

      console.log('✅ Verification token saved to database');
      console.log('📧 Sending emails in background...');

      Promise.all([
        emailService.sendWelcomeEmail({
          email,
          firstName,
          lastName,
          userType: 'consultant'
        }),
        emailService.sendVerificationEmail({
          email,
          firstName,
          lastName
        }, verificationToken) 
      ])
      .then(() => {
        console.log('✅ Both emails sent successfully to:', email);
      })
      .catch(emailError => {
        // Log error but don't fail the signup
        console.error('⚠️ Email sending failed (non-critical):', emailError.message);
        console.error('Full error:', emailError);
      });

    } catch (tokenError) {
      // If token generation fails, log but don't block signup
      console.error('⚠️ Verification token error:', tokenError.message);
    }

    // 🎯 RESPONSE SENT IMMEDIATELY (0.5-2 seconds instead of 3-5 minutes!)
    res.status(201).json({
      success: true,
      message: 'Consultant account created successfully! Please check your email to verify your account.',
      userId: userId
    });

  } catch (error) {
    console.error('❌ Create consultant account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating consultant account',
      error: error.message
    });
  }
};


// ==========================================
// GET CONSULTANT PROFILE & ALL FREELANCER PROFILES
// ==========================================
const getConsultantProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔍 Fetching consultant profile for user:', userId);

    // Get consultant profile
    const [profiles] = await db.query(
      `SELECT cp.*, u.is_active, u.email_verified
       FROM consultant_profiles cp
       JOIN users u ON cp.user_id = u.id
       WHERE cp.user_id = ?`,
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = profiles[0];

    // Get all freelancer profiles created by this consultant
    const [freelancers] = await db.query(
      `SELECT * FROM manpower_profiles 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Parse certificates for each freelancer
    const parsedFreelancers = freelancers.map(freelancer => {
      let certificates = [];
      try {
        if (freelancer.certificates) {
          if (typeof freelancer.certificates === 'string') {
            certificates = JSON.parse(freelancer.certificates);
          } else if (Array.isArray(freelancer.certificates)) {
            certificates = freelancer.certificates;
          } else if (Buffer.isBuffer(freelancer.certificates)) {
            certificates = JSON.parse(freelancer.certificates.toString('utf8'));
          }
        }
      } catch (e) {
        console.error('Error parsing certificates:', e);
        certificates = [];
      }
      return { ...freelancer, certificates };
    });

    console.log(`✅ Profile and ${parsedFreelancers.length} freelancer profiles fetched`);

    res.status(200).json({
      success: true,
      profile,
      freelancers: parsedFreelancers
    });

  } catch (error) {
    console.error('Get consultant profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE CONSULTANT PROFILE
// ==========================================
const updateConsultantProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔄 Updating consultant profile for user:', userId);
    console.log('📦 Body:', req.body);
    console.log('📎 Files:', req.files);

    const {
      name,
      companyName,
      location,
      mobileNumber,
      whatsappNumber
    } = req.body;

    // Get current profile
    const [currentProfile] = await db.query(
      'SELECT * FROM consultant_profiles WHERE user_id = ?',
      [userId]
    );

    if (currentProfile.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const current = currentProfile[0];

    // Handle profile photo update
    let profilePhotoUrl = current.profile_photo;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        console.log('📸 Uploading new profile photo...');
        
        if (current.profile_photo) {
          await deleteFromCloudinary(current.profile_photo);
        }
        
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path);
        console.log('✅ New profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Error updating profile photo:', error);
      }
    }

    // Update consultant profile
    await db.query(
      `UPDATE consultant_profiles 
       SET name = ?, company_name = ?, location = ?, mobile_number = ?,
           whatsapp_number = ?, profile_photo = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [
        name || current.name,
        companyName || current.company_name,
        location || current.location,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        profilePhotoUrl,
        userId
      ]
    );

    // Also update users table
    const nameParts = (name || current.name).trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    await db.query(
      `UPDATE users 
       SET first_name = ?, last_name = ?, mobile_number = ?, 
           whatsapp_number = ?, location = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        firstName,
        lastName,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        location || current.location,
        userId
      ]
    );

    console.log('✅ Consultant profile updated successfully');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

// ==========================================
// ADD FREELANCER PROFILE (Consultant creates a worker profile)
// ==========================================
// ==========================================
// ADD FREELANCER PROFILE (Consultant creates a worker profile)
// ==========================================
const addFreelancerProfile = async (req, res) => {
  const userId = req.user.userId; // Consultant's user ID

  try {
    console.log('➕ Adding freelancer profile for consultant:', userId);
    console.log('📦 Body:', req.body);
    console.log('📎 Files:', req.files);

    const {
      firstName,
      lastName,
      jobTitle,
      availabilityStatus,
      availableFrom,
      rate,
      profileDescription
    } = req.body;

    // Validation
    if (!firstName || !lastName || !jobTitle) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Please fill in first name, last name, and job title'
      });
    }

    // Get consultant's contact details
    console.log('🔍 Fetching consultant details for user:', userId);
    const [consultant] = await db.query(
      'SELECT email, mobile_number, whatsapp_number, location FROM consultant_profiles WHERE user_id = ?',
      [userId]
    );

    if (consultant.length === 0) {
      console.log('❌ Consultant profile not found for user:', userId);
      return res.status(404).json({
        success: false,
        message: 'Consultant profile not found'
      });
    }

    const consultantData = consultant[0];
    console.log('✅ Consultant data retrieved:', {
      email: consultantData.email,
      location: consultantData.location
    });

    // Handle file uploads
    let profilePhotoUrl = null;
    let cvPath = null;
    let certificatePaths = [];

    if (req.files) {
      if (req.files.profilePhoto && req.files.profilePhoto[0]) {
        try {
          console.log('📸 Uploading profile photo to Cloudinary...');
          profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path);
          console.log('✅ Profile photo uploaded:', profilePhotoUrl);
        } catch (error) {
          console.error('❌ Error uploading profile photo:', error);
        }
      }

      if (req.files.cv && req.files.cv[0]) {
        cvPath = req.files.cv[0].filename;
        console.log('📄 CV saved:', cvPath);
      }

      if (req.files.certificates && req.files.certificates.length > 0) {
        certificatePaths = req.files.certificates.map(file => file.filename);
        console.log('🏆 Certificates saved:', certificatePaths.length, 'files');
      }
    }

    // Insert freelancer profile with consultant's user_id
    console.log('💾 Inserting freelancer profile into database...');
    const [result] = await db.query(
      `INSERT INTO manpower_profiles 
      (user_id, first_name, last_name, email, mobile_number, whatsapp_number, location, 
       job_title, availability_status, available_from, rate, profile_description, 
       profile_photo, cv_path, certificates) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, // Consultant's user_id (KEY: This links to consultant)
        firstName,
        lastName,
        consultantData.email, // Consultant's email
        consultantData.mobile_number, // Consultant's mobile
        consultantData.whatsapp_number, // Consultant's WhatsApp
        consultantData.location, // Consultant's location
        jobTitle,
        availabilityStatus || 'available',
        availableFrom || null,
        rate || null,
        profileDescription || null,
        profilePhotoUrl,
        cvPath,
        JSON.stringify(certificatePaths)
      ]
    );

    console.log(`✅ Freelancer profile added successfully (ID: ${result.insertId})`);
    console.log('📊 Insert result:', result);

    res.status(201).json({
      success: true,
      message: 'Freelancer profile added successfully',
      freelancerId: result.insertId
    });

  } catch (error) {
    console.error('❌ Add freelancer profile error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Error adding freelancer profile',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE FREELANCER PROFILE
// ==========================================
const updateFreelancerProfile = async (req, res) => {
  const userId = req.user.userId; // Consultant's user ID
  const freelancerId = req.params.id;

  try {
    console.log('🔄 Updating freelancer profile:', freelancerId);

    const {
      firstName,
      lastName,
      jobTitle,
      availabilityStatus,
      availableFrom,
      rate,
      profileDescription,
      removePhoto,
      removeCv,
      deleteCertificates
    } = req.body;

    // Check if freelancer belongs to this consultant
    const [freelancer] = await db.query(
      'SELECT * FROM manpower_profiles WHERE id = ? AND user_id = ?',
      [freelancerId, userId]
    );

    if (freelancer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Freelancer profile not found or access denied'
      });
    }

    const current = freelancer[0];

    // Handle profile photo update/removal
    let profilePhotoUrl = current.profile_photo;
    
    if (removePhoto === 'true') {
      if (current.profile_photo) {
        await deleteFromCloudinary(current.profile_photo);
      }
      profilePhotoUrl = null;
      console.log('🗑️ Profile photo removed');
    } else if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        console.log('📸 Uploading new profile photo...');
        
        if (current.profile_photo) {
          await deleteFromCloudinary(current.profile_photo);
        }
        
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path);
        console.log('✅ New profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Error updating profile photo:', error);
      }
    }

    // Handle CV update/removal
    let cvPath = current.cv_path;
    
    if (removeCv === 'true') {
      if (current.cv_path) {
        deleteLocalFile(current.cv_path);
      }
      cvPath = null;
      console.log('🗑️ CV removed');
    } else if (req.files && req.files.cv && req.files.cv[0]) {
      console.log('📄 Updating CV...');
      
      if (current.cv_path) {
        deleteLocalFile(current.cv_path);
      }
      
      cvPath = req.files.cv[0].filename;
      console.log('✅ New CV saved:', cvPath);
    }

    // Handle certificates update and deletion
    let certificatePaths = [];
    try {
      certificatePaths = current.certificates ? JSON.parse(current.certificates) : [];
    } catch (e) {
      certificatePaths = [];
    }

    // Delete marked certificates
    if (deleteCertificates) {
      try {
        const certsToDelete = JSON.parse(deleteCertificates);
        console.log('🗑️ Deleting certificates:', certsToDelete);
        
        certsToDelete.forEach(certPath => {
          deleteLocalFile(certPath);
        });
        
        certificatePaths = certificatePaths.filter(cert => !certsToDelete.includes(cert));
        console.log('✅ Certificates deleted, remaining:', certificatePaths.length);
      } catch (e) {
        console.error('Error processing certificate deletions:', e);
      }
    }

    // Add new certificates
    if (req.files && req.files.certificates && req.files.certificates.length > 0) {
      console.log('🏆 Adding new certificates...');
      
      const newCertificates = req.files.certificates.map(file => file.filename);
      certificatePaths = [...certificatePaths, ...newCertificates];
      
      console.log('✅ Total certificates:', certificatePaths.length);
    }

    // Update freelancer profile
    await db.query(
      `UPDATE manpower_profiles 
       SET first_name = ?, last_name = ?, job_title = ?, 
           availability_status = ?, available_from = ?, rate = ?,
           profile_description = ?, profile_photo = ?, cv_path = ?, 
           certificates = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        firstName || current.first_name,
        lastName || current.last_name,
        jobTitle || current.job_title,
        availabilityStatus || current.availability_status,
        availableFrom || current.available_from,
        rate || current.rate,
        profileDescription !== undefined ? profileDescription : current.profile_description,
        profilePhotoUrl,
        cvPath,
        JSON.stringify(certificatePaths),
        freelancerId,
        userId
      ]
    );

    console.log('✅ Freelancer profile updated successfully');

    res.status(200).json({
      success: true,
      message: 'Freelancer profile updated successfully'
    });

  } catch (error) {
    console.error('❌ Update freelancer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating freelancer profile',
      error: error.message
    });
  }
};

// ==========================================
// DELETE FREELANCER PROFILE
// ==========================================
const deleteFreelancerProfile = async (req, res) => {
  const userId = req.user.userId;
  const freelancerId = req.params.id;

  try {
    console.log('🗑️ Deleting freelancer profile:', freelancerId);

    // Check if freelancer belongs to this consultant
    const [freelancer] = await db.query(
      'SELECT * FROM manpower_profiles WHERE id = ? AND user_id = ?',
      [freelancerId, userId]
    );

    if (freelancer.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Freelancer profile not found or access denied'
      });
    }

    const profile = freelancer[0];

    // Delete files from Cloudinary and local storage
    if (profile.profile_photo) {
      await deleteFromCloudinary(profile.profile_photo);
    }
    
    if (profile.cv_path) {
      deleteLocalFile(profile.cv_path);
    }

    let certificates = [];
    try {
      certificates = JSON.parse(profile.certificates || '[]');
    } catch (e) {
      certificates = [];
    }
    certificates.forEach(cert => deleteLocalFile(cert));

    // Delete from database
    await db.query(
      'DELETE FROM manpower_profiles WHERE id = ? AND user_id = ?',
      [freelancerId, userId]
    );

    console.log('✅ Freelancer profile deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Freelancer profile deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete freelancer profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting freelancer profile',
      error: error.message
    });
  }
};

module.exports = {
  createConsultantAccount,
  getConsultantProfile,
  updateConsultantProfile,
  addFreelancerProfile,
  updateFreelancerProfile,
  deleteFreelancerProfile
};