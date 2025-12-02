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
      national_id VARCHAR(30),
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

// Add national_id column if it doesn't exist (for existing tables)
const addNationalIdColumnToConsultant = async () => {
  try {
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'consultant_profiles' 
      AND COLUMN_NAME = 'national_id'
    `);

    if (columns.length === 0) {
      console.log('🔄 Adding national_id column to consultant_profiles...');
      
      await db.query(`
        ALTER TABLE consultant_profiles 
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

// ==========================================
// UPDATE USERS TABLE - Add 'consultant' to user_type ENUM
// ==========================================
const updateUsersTableForConsultant = async () => {
  try {
    const [columns] = await db.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'user_type'
    `);

    if (columns.length > 0) {
      const columnType = columns[0].COLUMN_TYPE;
      
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
  }
};

// ==========================================
// INITIALIZE TABLES ON MODULE LOAD
// ==========================================
(async () => {
  try {
    await createConsultantProfilesTable();
    await addNationalIdColumnToConsultant();
    await updateUsersTableForConsultant();
  } catch (error) {
    console.error('Failed to initialize consultant tables:', error);
  }
})();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

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
      nationalId,
      companyName
    } = req.body;

    if (!name || !email || !password || !nationalId || !mobileNumber || !location) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (name, email, password, national ID, mobile, location)'
      });
    }

    // Trim whitespace
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedNationalId = nationalId.trim();
    const trimmedMobile = mobileNumber.trim();
    const trimmedLocation = location.trim();

    // National ID validation
    if (trimmedNationalId.length < 5 || trimmedNationalId.length > 30) {
      return res.status(400).json({
        success: false,
        message: 'National ID must be between 5 and 30 characters'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    if (trimmedMobile.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid mobile number (at least 10 digits)'
      });
    }

    const emailRoleExists = await checkEmailRoleExists(trimmedEmail, 'consultant');
    if (emailRoleExists) {
      return res.status(400).json({
        success: false,
        message: 'You already have a Consultant account with this email. Please login or use a different email.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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

    const finalWhatsappNumber = whatsappNumber || trimmedMobile;
    const nameParts = trimmedName.split(' ');
    const firstName = nameParts[0] || trimmedName;
    const lastName = nameParts.slice(1).join(' ') || '';

    console.log('👤 Creating user in users table...');
    const userResult = await createUser({
      first_name: firstName,
      last_name: lastName,
      email: trimmedEmail,
      password: hashedPassword,
      mobile_number: trimmedMobile,
      whatsapp_number: finalWhatsappNumber,
      location: trimmedLocation,
      user_type: 'consultant'
    });

    const userId = userResult.userId;
    console.log('✅ User created with ID:', userId);

    console.log('🏢 Creating consultant profile...');
    await db.query(
      `INSERT INTO consultant_profiles 
      (user_id, name, email, mobile_number, whatsapp_number, national_id, location, company_name, profile_photo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        trimmedName,
        trimmedEmail,
        trimmedMobile,
        finalWhatsappNumber,
        trimmedNationalId,
        trimmedLocation,
        companyName || null,
        profilePhotoUrl
      ]
    );

    console.log(`✅ Consultant account created: ${trimmedEmail} (User ID: ${userId})`);

    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
      
      const tokenExpiry = new Date(Date.now() + 24 * 3600000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');

      console.log('🔐 Generated verification token for user:', userId);

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
          email: trimmedEmail,
          firstName,
          lastName,
          userType: 'consultant'
        }),
        emailService.sendVerificationEmail({
          email: trimmedEmail,
          firstName,
          lastName
        }, verificationToken) 
      ])
      .then(() => {
        console.log('✅ Both emails sent successfully to:', trimmedEmail);
      })
      .catch(emailError => {
        console.error('⚠️ Email sending failed (non-critical):', emailError.message);
      });

    } catch (tokenError) {
      console.error('⚠️ Verification token error:', tokenError.message);
    }

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

    const [freelancers] = await db.query(
      `SELECT * FROM manpower_profiles 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

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
      whatsappNumber,
      nationalId,
      removePhoto
    } = req.body;

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

    await db.query(
      `UPDATE consultant_profiles 
       SET name = ?, company_name = ?, location = ?, mobile_number = ?,
           whatsapp_number = ?, national_id = ?, profile_photo = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [
        name || current.name,
        companyName || current.company_name,
        location || current.location,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        nationalId !== undefined ? nationalId : current.national_id,
        profilePhotoUrl,
        userId
      ]
    );

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
      message: 'Profile updated successfully',
      profilePhotoUrl: profilePhotoUrl
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
// ADD FREELANCER PROFILE
// ==========================================
const addFreelancerProfile = async (req, res) => {
  const userId = req.user.userId;

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

    if (!firstName || !lastName || !jobTitle) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Please fill in first name, last name, and job title'
      });
    }

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

    console.log('💾 Inserting freelancer profile into database...');
    const [result] = await db.query(
      `INSERT INTO manpower_profiles 
      (user_id, first_name, last_name, email, mobile_number, whatsapp_number, location, 
       job_title, availability_status, available_from, rate, profile_description, 
       profile_photo, cv_path, certificates) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        firstName,
        lastName,
        consultantData.email,
        consultantData.mobile_number,
        consultantData.whatsapp_number,
        consultantData.location,
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

    res.status(201).json({
      success: true,
      message: 'Freelancer profile added successfully',
      freelancerId: result.insertId
    });

  } catch (error) {
    console.error('❌ Add freelancer profile error:', error);
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
  const userId = req.user.userId;
  const freelancerId = req.params.id;

  try {
    console.log('🔄 Updating freelancer profile:', freelancerId);
    console.log('📦 Body:', req.body);
    console.log('📎 Files:', req.files);

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
      deleteCertificates,
      keepExistingCertificates
    } = req.body;

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

    // Handle profile photo
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

    // Handle CV
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
    let certificatePaths = [];
    
    // Parse existing certificates
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

    console.log('📊 Initial certificate count:', certificatePaths.length);

    // Delete marked certificates FIRST (if any)
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

    // Add NEW certificates (if any)
    if (req.files && req.files.certificates && req.files.certificates.length > 0) {
      console.log('🏆 Adding new certificates...');
      
      const newCertificates = req.files.certificates.map(file => file.filename);
      certificatePaths = [...certificatePaths, ...newCertificates];
      
      console.log('✅ Total certificates after addition:', certificatePaths.length);
    }

    const shouldUpdateCertificates = deleteCertificates || 
                                     (req.files && req.files.certificates && req.files.certificates.length > 0);

    console.log('🔍 Should update certificates?', shouldUpdateCertificates);
    console.log('🔍 Keep existing flag:', keepExistingCertificates);

    // Build update query conditionally
    const updateFields = [
      'first_name = ?',
      'last_name = ?',
      'job_title = ?',
      'availability_status = ?',
      'available_from = ?',
      'rate = ?',
      'profile_description = ?',
      'profile_photo = ?',
      'cv_path = ?'
    ];

    const updateValues = [
      firstName || current.first_name,
      lastName || current.last_name,
      jobTitle || current.job_title,
      availabilityStatus || current.availability_status,
      availableFrom || current.available_from,
      rate || current.rate,
      profileDescription !== undefined ? profileDescription : current.profile_description,
      profilePhotoUrl,
      cvPath
    ];

    if (shouldUpdateCertificates) {
      updateFields.push('certificates = ?');
      updateValues.push(JSON.stringify(certificatePaths));
      console.log('📝 Updating certificates field with:', certificatePaths.length, 'certificates');
    } else {
      console.log('⏭️ Skipping certificates update - preserving existing');
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(freelancerId, userId);

    const updateQuery = `UPDATE manpower_profiles 
                        SET ${updateFields.join(', ')}
                        WHERE id = ? AND user_id = ?`;

    console.log('🔧 Executing update query...');
    await db.query(updateQuery, updateValues);

    console.log('✅ Freelancer profile updated successfully');
    console.log('📊 Final certificate count:', certificatePaths.length);

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