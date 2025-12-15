const db = require('../config/db');
const bcrypt = require('bcrypt');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');
const { createUser, checkEmailRoleExists } = require('./userController');
const emailService = require('../services/emailService');
const { clearCategoryCache } = require('./manpowerSearchController');

// Create manpower_profiles table if it doesn't exist
const createManpowerTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS manpower_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      national_id VARCHAR(30),
      location VARCHAR(255) NOT NULL,
      job_title VARCHAR(255) NOT NULL,
      availability_status ENUM('available', 'busy') NOT NULL DEFAULT 'available',
      available_from DATE,
      rate VARCHAR(100),
      profile_description TEXT,
      profile_photo VARCHAR(500),
      cv_path VARCHAR(500),
      certificates JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_email (email),
      INDEX idx_job_title (job_title),
      INDEX idx_availability (availability_status),
      INDEX idx_location (location),
      INDEX idx_name (first_name, last_name)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Manpower profiles table created or already exists');
  } catch (error) {
    console.error('❌ Error creating manpower profiles table:', error);
    throw error;
  }
};

// Update manpower_profiles table to add national_id column (for existing tables)
const addNationalIdColumn = async () => {
  try {
    // Check if national_id column exists
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'manpower_profiles' 
      AND COLUMN_NAME = 'national_id'
    `);

    if (columns.length === 0) {
      console.log('🔄 Adding national_id column to manpower_profiles...');
      
      await db.query(`
        ALTER TABLE manpower_profiles 
        ADD COLUMN national_id VARCHAR(30) NULL AFTER whatsapp_number
      `);
      
      console.log('✅ national_id column added successfully');
    } else {
      console.log('✅ national_id column already exists');
    }
  } catch (error) {
    console.error('❌ Error adding national_id column:', error);
  }
};

// Initialize table on module load
(async () => {
  try {
    await createManpowerTable();
    await addNationalIdColumn();
  } catch (error) {
    console.error('Failed to initialize manpower profiles table:', error);
  }
})();

// Helper function to upload image to Cloudinary from file path
const uploadToCloudinary = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'manpower_profiles',
      resource_type: 'image',
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ]
    });
    
    // Delete the local file after uploading to Cloudinary
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.warn('⚠️ Could not delete local file:', filePath);
    }
    
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Helper function to delete file from Cloudinary
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return;
    
    // Extract public_id from Cloudinary URL
    const matches = imageUrl.match(/\/manpower_profiles\/([^\.]+)/);
    if (matches && matches[1]) {
      const publicId = `manpower_profiles/${matches[1]}`;
      await cloudinary.uploader.destroy(publicId);
      console.log('🗑️ Deleted old image from Cloudinary:', publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// Helper function to delete local files
const deleteLocalFile = (filename) => {
  try {
    if (!filename) return;
    
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

// Helper function to safely delete uploaded files on error
const cleanupUploadedFiles = (req) => {
  try {
    if (req.files) {
      // Delete profile photo
      if (req.files.profilePhoto && req.files.profilePhoto[0]) {
        const photoPath = req.files.profilePhoto[0].path;
        if (fs.existsSync(photoPath)) {
          fs.unlinkSync(photoPath);
          console.log('🧹 Cleaned up profile photo');
        }
      }
      
      // Delete CV
      if (req.files.cv && req.files.cv[0]) {
        deleteLocalFile(req.files.cv[0].filename);
      }
      
      // Delete certificates
      if (req.files.certificates && req.files.certificates.length > 0) {
        req.files.certificates.forEach(file => {
          deleteLocalFile(file.filename);
        });
      }
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

// Create Manpower Account
const createManpowerAccount = async (req, res) => {
  console.log('🎯 createManpowerAccount called');
  console.log('📦 Body:', req.body);
  console.log('📎 Files:', req.files);

  try {
    const {
      firstName,
      lastName,
      email,
      password,
      jobTitle,
      availabilityStatus,
      availableFrom,
      location,
      rate,
      mobileNumber,
      whatsappNumber,
      profileDescription,
      nationalId
    } = req.body;

    // Validation
    if (!firstName || !lastName || !nationalId || !email || !password || !jobTitle || !availabilityStatus || !mobileNumber || !location) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Trim whitespace
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedLocation = location.trim();
    const trimmedJobTitle = jobTitle.trim();
    const trimmedMobile = mobileNumber.trim();
    const trimmedNationalId = nationalId ? nationalId.trim() : '';

    // National ID validation (required)
    if (!trimmedNationalId) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'National ID is required'
      });
    }

    if (trimmedNationalId.length < 5 || trimmedNationalId.length > 30) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'National ID must be between 5 and 30 characters'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Password validation
    if (password.length < 6) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Mobile number validation
    if (trimmedMobile.length < 10) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid mobile number (at least 10 digits)'
      });
    }

    // Check if email exists with 'manpower' role
    const emailRoleExists = await checkEmailRoleExists(trimmedEmail, 'manpower');
    if (emailRoleExists) {
      cleanupUploadedFiles(req);
      return res.status(400).json({
        success: false,
        message: 'You already have a Freelancer account with this email. Please login or use a different email.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle profile photo upload to Cloudinary
    let profilePhotoUrl = null;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        console.log('📸 Uploading profile photo to Cloudinary...');
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path);
        console.log('✅ Profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
        cleanupUploadedFiles(req);
        return res.status(500).json({
          success: false,
          message: 'Error uploading profile photo. Please try again.'
        });
      }
    }

    // Handle CV upload (stored locally) - Store only filename
    let cvPath = null;
    if (req.files && req.files.cv && req.files.cv[0]) {
      cvPath = req.files.cv[0].filename;
      console.log('📄 CV saved:', cvPath);
    }

    // Handle certificates upload (stored locally) - Store only filenames
    let certificatePaths = [];
    if (req.files && req.files.certificates && req.files.certificates.length > 0) {
      certificatePaths = req.files.certificates.map(file => file.filename);
      console.log('🏆 Certificates saved:', certificatePaths.length, 'files');
    }

    // Auto-fill WhatsApp with mobile if not provided
    const finalWhatsappNumber = whatsappNumber ? whatsappNumber.trim() : trimmedMobile;

    console.log('👤 Creating user in users table...');
    let userResult;
    try {
      userResult = await createUser({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        email: trimmedEmail,
        password: hashedPassword,
        mobile_number: trimmedMobile,
        whatsapp_number: finalWhatsappNumber,
        location: trimmedLocation,
        user_type: 'manpower',
        privacy_policy_accepted: true,
        privacy_policy_accepted_at: new Date()
      });
    } catch (userError) {
      console.error('❌ Error creating user:', userError);
      
      // Cleanup uploaded files
      cleanupUploadedFiles(req);
      if (profilePhotoUrl) {
        await deleteFromCloudinary(profilePhotoUrl);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error creating user account. Please try again.'
      });
    }

    const userId = userResult.userId;
    console.log('✅ User created with ID:', userId);

    // Step 2: Create manpower profile
    console.log('💼 Creating manpower profile...');
    try {
      await db.query(
        `INSERT INTO manpower_profiles 
        (user_id, first_name, last_name, email, mobile_number, whatsapp_number, national_id, location, 
         job_title, availability_status, available_from, rate, profile_description, 
         profile_photo, cv_path, certificates) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          trimmedFirstName,
          trimmedLastName,
          trimmedEmail,
          trimmedMobile,
          finalWhatsappNumber,
          trimmedNationalId,
          trimmedLocation,
          trimmedJobTitle,
          availabilityStatus,
          availableFrom || null,
          rate || null,
          profileDescription || null,
          profilePhotoUrl,
          cvPath,
          JSON.stringify(certificatePaths)
        ]
      );
    } catch (profileError) {
      console.error('❌ Error creating manpower profile:', profileError);
      
      // Cleanup - delete user and uploaded files
      try {
        await db.query('DELETE FROM users WHERE id = ?', [userId]);
        console.log('🧹 Rolled back user creation');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
      }
      
      cleanupUploadedFiles(req);
      if (profilePhotoUrl) {
        await deleteFromCloudinary(profilePhotoUrl);
      }
      
      return res.status(500).json({
        success: false,
        message: 'Error creating profile. Please try again.'
      });
    }

    console.log(`✅ Manpower account created: ${trimmedEmail} (User ID: ${userId})`);

    // Clear cache - New job title added to database
    clearCategoryCache();
    console.log('🔄 Category cache cleared for new profile');

    // Send welcome email (don't fail if email fails)
    try {
      await emailService.sendWelcomeEmail({
        email: trimmedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        userType: 'manpower'
      });
      console.log('✅ Welcome email sent to:', trimmedEmail);
    } catch (emailError) {
      console.error('⚠️ Welcome email failed (non-critical):', emailError.message);
      // Don't return error - account was created successfully
    }

    res.status(201).json({
      success: true,
      message: 'Manpower account created successfully',
      userId: userId
    });

  } catch (error) {
    console.error('❌ Manpower signup error:', error);
    console.error('Error stack:', error.stack);
    
    // Cleanup uploaded files
    cleanupUploadedFiles(req);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔍 Fetching profile for user ID:', userId);

    const [profiles] = await db.query(
  `SELECT mp.*, u.is_active, u.created_at as account_created
   FROM manpower_profiles mp
   JOIN users u ON mp.user_id = u.id
   WHERE mp.user_id = ?`,
  [userId]
);


    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = profiles[0];
    
    // Parse certificates JSON safely
    let parsedCertificates = [];
    if (profile.certificates) {
      try {
        if (typeof profile.certificates === 'string') {
          parsedCertificates = JSON.parse(profile.certificates);
        } else if (Array.isArray(profile.certificates)) {
          parsedCertificates = profile.certificates;
        } else if (Buffer.isBuffer(profile.certificates)) {
          parsedCertificates = JSON.parse(profile.certificates.toString('utf8'));
        }
      } catch (e) {
        console.error('Error parsing certificates:', e);
        parsedCertificates = [];
      }
    }
    
    profile.certificates = parsedCertificates;

    console.log('✅ Profile data prepared:', {
      user_id: profile.user_id,
      name: `${profile.first_name} ${profile.last_name}`,
      has_photo: !!profile.profile_photo,
      has_cv: !!profile.cv_path,
      cv_filename: profile.cv_path,
      certificates_count: parsedCertificates.length,
      has_national_id: !!profile.national_id
    });

    res.status(200).json({
      success: true,
      profile: profile
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// Update Manpower Profile
const updateProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔍 Update profile called for user:', userId);
    console.log('📦 Body:', req.body);
    console.log('📎 Files:', req.files);

    const {
      firstName,
      lastName,
      jobTitle,
      availabilityStatus,
      availableFrom,
      location,
      rate,
      mobileNumber,
      whatsappNumber,
      profileDescription,
      nationalId,
      removePhoto,
      removeCv,
      deleteCertificates
    } = req.body;

    // Get current profile
    const [currentProfile] = await db.query(
      'SELECT * FROM manpower_profiles WHERE user_id = ?',
      [userId]
    );

    if (currentProfile.length === 0) {
      cleanupUploadedFiles(req);
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const current = currentProfile[0];

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
        cleanupUploadedFiles(req);
        return res.status(500).json({
          success: false,
          message: 'Error uploading profile photo'
        });
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

    // Handle certificates
    const { keepExistingCertificates } = req.body;

    // Get current certificates
    let certificatePaths = [];
    try {
      if (current.certificates) {
        if (Buffer.isBuffer(current.certificates)) {
          certificatePaths = JSON.parse(current.certificates.toString('utf8'));
        } else if (typeof current.certificates === 'string') {
          certificatePaths = JSON.parse(current.certificates);
        } else if (Array.isArray(current.certificates)) {
          certificatePaths = current.certificates;
        }
      }
    } catch (e) {
      console.error('Error parsing existing certificates:', e);
      certificatePaths = [];
    }

    // Delete marked certificates FIRST
    if (deleteCertificates) {
      try {
        const certsToDelete = JSON.parse(deleteCertificates);
        console.log('🗑️ Deleting certificates:', certsToDelete);
        
        certsToDelete.forEach(certPath => {
          deleteLocalFile(certPath);
        });
        
        // Remove from array
        certificatePaths = certificatePaths.filter(cert => !certsToDelete.includes(cert));
        console.log('✅ Certificates deleted, remaining:', certificatePaths.length);
      } catch (e) {
        console.error('Error processing certificate deletions:', e);
      }
    }

    // Add NEW certificates (if any)
    if (req.files && req.files.certificates && req.files.certificates.length > 0) {
      console.log('🏆 Adding new certificates...');
      
      const newCertificates = req.files.certificates.map(file => file.filename);
      certificatePaths = [...certificatePaths, ...newCertificates];
      
      console.log('✅ Total certificates after addition:', certificatePaths.length);
    }

    // Update manpower profile
    await db.query(
      `UPDATE manpower_profiles 
       SET first_name = ?, last_name = ?, job_title = ?, availability_status = ?,
           available_from = ?, location = ?, rate = ?, mobile_number = ?,
           whatsapp_number = ?, national_id = ?, profile_description = ?, profile_photo = ?,
           cv_path = ?, certificates = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [
        firstName || current.first_name,
        lastName || current.last_name,
        jobTitle || current.job_title,
        availabilityStatus || current.availability_status,
        availableFrom || current.available_from,
        location || current.location,
        rate || current.rate,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        nationalId !== undefined ? nationalId : current.national_id,
        profileDescription !== undefined ? profileDescription : current.profile_description,
        profilePhotoUrl,
        cvPath,
        JSON.stringify(certificatePaths),
        userId
      ]
    );

    // Also update users table
    await db.query(
      `UPDATE users 
       SET first_name = ?, last_name = ?, mobile_number = ?,
           whatsapp_number = ?, location = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        firstName || current.first_name,
        lastName || current.last_name,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        location || current.location,
        userId
      ]
    );

    console.log('✅ Profile updated successfully');

    // Clear cache - Only if job title changed
    if (jobTitle && jobTitle !== current.job_title) {
      clearCategoryCache();
      console.log('🔄 Category cache cleared due to job title change');
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profilePhotoUrl: profilePhotoUrl || null
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    cleanupUploadedFiles(req);
    
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

module.exports = {
  createManpowerAccount,
  getProfile,
  updateProfile
};