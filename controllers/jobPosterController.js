// controllers/jobPosterController.js - COMPLETE VERSION WITH MIGRATIONS
const db = require('../config/db');
const bcrypt = require('bcrypt');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const { createUser, checkEmailRoleExists } = require('./userController');
const emailService = require('../services/emailService');
const { DEFAULT_JOB_EXPIRY_DAYS, isValidIndustry } = require('../utils/industryCategories');

// ==========================================
// CREATE JOB_POSTER_PROFILES TABLE
// ==========================================
const createJobPosterProfilesTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS job_poster_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      company_name VARCHAR(255) NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      national_id VARCHAR(30),
      location VARCHAR(255) NOT NULL,
      industry VARCHAR(100),
      company_size ENUM('1-10', '11-50', '51-200', '201-500', '500+'),
      profile_photo VARCHAR(500),
      company_logo VARCHAR(500),
      jobs_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_email (email),
      INDEX idx_industry (industry),
      INDEX idx_location (location)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Job poster profiles table created or already exists');
  } catch (error) {
    console.error('❌ Error creating job poster profiles table:', error);
    throw error;
  }
};

// ==========================================
// CREATE JOBS TABLE
// ==========================================
const createJobsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_title VARCHAR(255) NOT NULL,
      company_name VARCHAR(255) NOT NULL,
      industry VARCHAR(100),
      location VARCHAR(255) NOT NULL,
      job_type ENUM('full-time', 'part-time', 'contract', 'temporary', 'internship') NOT NULL,
      experience_level ENUM('entry', 'mid', 'senior', 'executive') NOT NULL,
      salary_range VARCHAR(100),
      description TEXT NOT NULL,
      requirements TEXT,
      benefits TEXT,
      status ENUM('open', 'closed', 'filled') DEFAULT 'open',
      applications_count INT DEFAULT 0,
      views_count INT DEFAULT 0,
      posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expiry_date DATE,
      auto_close_on_expiry BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_job_title (job_title),
      INDEX idx_location (location),
      INDEX idx_industry (industry),
      INDEX idx_status (status),
      INDEX idx_job_type (job_type),
      INDEX idx_experience_level (experience_level),
      INDEX idx_expiry_date (expiry_date)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Jobs table created or already exists');
  } catch (error) {
    console.error('❌ Error creating jobs table:', error);
    throw error;
  }
};

// ==========================================
// CREATE SAVED_JOBS TABLE
// ==========================================
const createSavedJobsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id INT NOT NULL,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_job (user_id, job_id),
      INDEX idx_user_id (user_id),
      INDEX idx_job_id (job_id)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Saved jobs table created or already exists');
  } catch (error) {
    console.error('❌ Error creating saved jobs table:', error);
    throw error;
  }
};

// ==========================================
// CREATE JOB_APPLICATIONS TABLE (Track who applied)
// ==========================================
const createJobApplicationsTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS job_applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      job_id INT NOT NULL,
      applicant_user_id INT NOT NULL,
      applicant_name VARCHAR(200) NOT NULL,
      applicant_email VARCHAR(255) NOT NULL,
      applicant_phone VARCHAR(20),
      cover_message TEXT,
      application_status ENUM('pending', 'reviewed', 'shortlisted', 'rejected') DEFAULT 'pending',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (applicant_user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY unique_job_applicant (job_id, applicant_user_id),
      INDEX idx_job_id (job_id),
      INDEX idx_applicant_user_id (applicant_user_id),
      INDEX idx_status (application_status)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Job applications table created or already exists');
  } catch (error) {
    console.error('❌ Error creating job applications table:', error);
    throw error;
  }
};

// ==========================================
// MIGRATION: ADD CV AND PHOTO COLUMNS
// ==========================================
const addCvAndPhotoColumns = async () => {
  try {
    // Check if cv_path column exists
    const [cvPathColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'job_applications' 
      AND COLUMN_NAME = 'cv_path'
    `);

    if (cvPathColumn.length === 0) {
      console.log('📄 Adding cv_path column to job_applications table...');
      await db.query(`
        ALTER TABLE job_applications 
        ADD COLUMN cv_path VARCHAR(500) NULL AFTER cover_message
      `);
      console.log('✅ cv_path column added successfully');
    } else {
      console.log('✅ cv_path column already exists');
    }

    // Check if photo_path column exists
    const [photoPathColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'job_applications' 
      AND COLUMN_NAME = 'photo_path'
    `);

    if (photoPathColumn.length === 0) {
      console.log('📸 Adding photo_path column to job_applications table...');
      await db.query(`
        ALTER TABLE job_applications 
        ADD COLUMN photo_path VARCHAR(500) NULL AFTER cv_path
      `);
      console.log('✅ photo_path column added successfully');
    } else {
      console.log('✅ photo_path column already exists');
    }

  } catch (error) {
    console.error('❌ Error adding cv_path and photo_path columns:', error);
    // Don't throw - allow app to continue
  }
};

// ==========================================
// MIGRATION: UPDATE APPLICANT_USER_ID TO ALLOW NULL
// ==========================================
const updateApplicantUserIdColumn = async () => {
  try {
    console.log('🔄 Updating applicant_user_id to allow NULL values...');
    await db.query(`
      ALTER TABLE job_applications 
      MODIFY COLUMN applicant_user_id INT NULL
    `);
    console.log('✅ applicant_user_id column updated to allow NULL');
  } catch (error) {
    console.error('❌ Error updating applicant_user_id column:', error);
    // Don't throw - allow app to continue
  }
};

// ==========================================
// MIGRATION: DROP UNIQUE CONSTRAINT ON applicant_user_id
// ==========================================
const updateJobApplicationsUniqueConstraint = async () => {
  try {
    // Check if the unique constraint exists
    const [constraints] = await db.query(`
      SHOW INDEXES FROM job_applications 
      WHERE Key_name = 'unique_job_applicant'
    `);

    if (constraints.length > 0) {
      console.log('🔄 Dropping unique_job_applicant constraint...');
      await db.query(`
        ALTER TABLE job_applications 
        DROP INDEX unique_job_applicant
      `);
      console.log('✅ unique_job_applicant constraint dropped (allows guest applications)');
    } else {
      console.log('✅ unique_job_applicant constraint does not exist');
    }

  } catch (error) {
    console.error('❌ Error updating job applications constraint:', error);
    // Don't throw - allow app to continue
  }
};

// Initialize tables on module load
(async () => {
  try {
    await createJobPosterProfilesTable();
    await createJobsTable();
    await createSavedJobsTable();
    await createJobApplicationsTable();
    await addCvAndPhotoColumns(); // Add CV and photo columns
    await updateApplicantUserIdColumn(); // Allow NULL for guest applications
    await updateJobApplicationsUniqueConstraint(); // Allow multiple guest applications
  } catch (error) {
    console.error('Failed to initialize job poster tables:', error);
  }
})();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const uploadToCloudinary = async (filePath, folder = 'job_posters') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
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
    
    const matches = imageUrl.match(/\/(job_posters|company_logos)\/([^\.]+)/);
    if (matches && matches[1] && matches[2]) {
      const publicId = `${matches[1]}/${matches[2]}`;
      await cloudinary.uploader.destroy(publicId);
      console.log('🗑️ Deleted from Cloudinary:', publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// ==========================================
// CREATE JOB POSTER ACCOUNT (SIGNUP)
// ==========================================
const createJobPosterAccount = async (req, res) => {
  console.log('🎯 createJobPosterAccount called');
  console.log('📦 Body:', req.body);
  console.log('📎 Files:', req.files);

  try {
    const {
      companyName,
      name,
      email,
      password,
      nationalId,
      location,
      mobileNumber,
      whatsappNumber,
      industry,
      companySize
    } = req.body;

    // Validation
    if (!companyName || !name || !email || !password || !nationalId || !mobileNumber || !location) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedNationalId = nationalId.trim();

    // National ID validation
    if (trimmedNationalId.length < 5 || trimmedNationalId.length > 30) {
      return res.status(400).json({
        success: false,
        message: 'National ID must be between 5 and 30 characters'
      });
    }

    // Email validation
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

    // Check if email exists with 'job_poster' role
    const emailRoleExists = await checkEmailRoleExists(trimmedEmail, 'job_poster');
    if (emailRoleExists) {
      return res.status(400).json({
        success: false,
        message: 'You already have a Job Poster account with this email. Please login or use a different email.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle file uploads
    let profilePhotoUrl = null;
    let companyLogoUrl = null;

    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path, 'job_posters');
        console.log('✅ Profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Profile photo upload error:', error);
      }
    }

    if (req.files && req.files.companyLogo && req.files.companyLogo[0]) {
      try {
        companyLogoUrl = await uploadToCloudinary(req.files.companyLogo[0].path, 'company_logos');
        console.log('✅ Company logo uploaded:', companyLogoUrl);
      } catch (error) {
        console.error('❌ Company logo upload error:', error);
      }
    }

    const finalWhatsappNumber = whatsappNumber || mobileNumber;

    // Create user in users table
    console.log('👤 Creating user in users table...');
    const userResult = await createUser({
      first_name: name.split(' ')[0] || name,
      last_name: name.split(' ').slice(1).join(' ') || '',
      email: trimmedEmail,
      password: hashedPassword,
      mobile_number: mobileNumber,
      whatsapp_number: finalWhatsappNumber,
      location,
      user_type: 'job_poster',
      privacy_policy_accepted: true,
      privacy_policy_accepted_at: new Date()
    });

    const userId = userResult.userId;
    console.log('✅ User created with ID:', userId);

    // Create job poster profile
    console.log('🏢 Creating job poster profile...');
    await db.query(
      `INSERT INTO job_poster_profiles 
      (user_id, company_name, name, email, mobile_number, whatsapp_number, national_id, 
       location, industry, company_size, profile_photo, company_logo, jobs_count) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        userId,
        companyName,
        name,
        trimmedEmail,
        mobileNumber,
        finalWhatsappNumber,
        trimmedNationalId,
        location,
        industry || null,
        companySize || null,
        profilePhotoUrl,
        companyLogoUrl
      ]
    );

    console.log(`✅ Job poster account created: ${trimmedEmail} (User ID: ${userId})`);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail({
        email: trimmedEmail,
        firstName: name.split(' ')[0] || name,
        lastName: name.split(' ').slice(1).join(' ') || '',
        userType: 'job_poster'
      });
      console.log('✅ Welcome email sent to:', trimmedEmail);
    } catch (emailError) {
      console.error('⚠️ Welcome email failed (non-critical):', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Job poster account created successfully! You can now log in.',
      userId: userId
    });

  } catch (error) {
    console.error('❌ Create job poster account error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account',
      error: error.message
    });
  }
};

// ==========================================
// GET JOB POSTER PROFILE & ALL JOBS
// ==========================================
const getJobPosterProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔍 Fetching job poster profile for user:', userId);

    const [profiles] = await db.query(
      `SELECT jpp.*, u.is_active
       FROM job_poster_profiles jpp
       JOIN users u ON jpp.user_id = u.id
       WHERE jpp.user_id = ?`,
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = profiles[0];

    // Get all jobs posted by this user
    const [jobs] = await db.query(
      `SELECT * FROM jobs 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    console.log(`✅ Profile and ${jobs.length} jobs fetched`);

    res.status(200).json({
      success: true,
      profile,
      jobs: jobs || []
    });

  } catch (error) {
    console.error('Get job poster profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE JOB POSTER PROFILE
// ==========================================
const updateJobPosterProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('📝 Updating job poster profile for user:', userId);

    const {
      companyName,
      name,
      location,
      mobileNumber,
      whatsappNumber,
      nationalId,
      industry,
      companySize,
      removePhoto,
      removeLogo
    } = req.body;

    const [currentProfile] = await db.query(
      'SELECT * FROM job_poster_profiles WHERE user_id = ?',
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
        if (current.profile_photo) {
          await deleteFromCloudinary(current.profile_photo);
        }
        profilePhotoUrl = await uploadToCloudinary(req.files.profilePhoto[0].path, 'job_posters');
        console.log('✅ New profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Error updating profile photo:', error);
      }
    }

    // Handle company logo update/removal
    let companyLogoUrl = current.company_logo;
    
    if (removeLogo === 'true') {
      if (current.company_logo) {
        await deleteFromCloudinary(current.company_logo);
      }
      companyLogoUrl = null;
      console.log('🗑️ Company logo removed');
    } else if (req.files && req.files.companyLogo && req.files.companyLogo[0]) {
      try {
        if (current.company_logo) {
          await deleteFromCloudinary(current.company_logo);
        }
        companyLogoUrl = await uploadToCloudinary(req.files.companyLogo[0].path, 'company_logos');
        console.log('✅ New company logo uploaded:', companyLogoUrl);
      } catch (error) {
        console.error('❌ Error updating company logo:', error);
      }
    }

    await db.query(
      `UPDATE job_poster_profiles 
       SET company_name = ?, name = ?, location = ?, mobile_number = ?,
           whatsapp_number = ?, national_id = ?, industry = ?, company_size = ?,
           profile_photo = ?, company_logo = ?, updated_at = NOW()
       WHERE user_id = ?`,
      [
        companyName || current.company_name,
        name || current.name,
        location || current.location,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        nationalId !== undefined ? nationalId : current.national_id,
        industry || current.industry,
        companySize || current.company_size,
        profilePhotoUrl,
        companyLogoUrl,
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
        name || current.name,
        '',
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        location || current.location,
        userId
      ]
    );

    console.log('✅ Job poster profile updated successfully');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profilePhotoUrl: profilePhotoUrl || null,
      companyLogoUrl: companyLogoUrl || null
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
// CREATE JOB
// ==========================================
const createJob = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('➕ Creating job for user:', userId);

    const {
      jobTitle,
      industry,
      location,
      jobType,
      experienceLevel,
      salaryRange,
      description,
      requirements,
      benefits,
      expiryDays
    } = req.body;

    // Validation
    if (!jobTitle || !location || !jobType || !experienceLevel || !description) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields (job title, location, job type, experience level, description)'
      });
    }

    // Get company name from profile
    const [profiles] = await db.query(
      'SELECT company_name FROM job_poster_profiles WHERE user_id = ?',
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job poster profile not found'
      });
    }

    const companyName = profiles[0].company_name;

    // Calculate expiry date
    const daysUntilExpiry = parseInt(expiryDays) || DEFAULT_JOB_EXPIRY_DAYS;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysUntilExpiry);
    const formattedExpiryDate = expiryDate.toISOString().split('T')[0];

    // Insert job
    const [result] = await db.query(
      `INSERT INTO jobs 
      (user_id, job_title, company_name, industry, location, job_type, 
       experience_level, salary_range, description, requirements, benefits, 
       status, expiry_date, auto_close_on_expiry) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, TRUE)`,
      [
        userId,
        jobTitle.trim(),
        companyName,
        industry || null,
        location.trim(),
        jobType,
        experienceLevel,
        salaryRange || null,
        description.trim(),
        requirements || null,
        benefits || null,
        formattedExpiryDate
      ]
    );

    // Increment jobs_count
    await db.query(
      'UPDATE job_poster_profiles SET jobs_count = jobs_count + 1 WHERE user_id = ?',
      [userId]
    );

    console.log(`✅ Job created with ID: ${result.insertId}`);

    res.status(201).json({
      success: true,
      message: 'Job posted successfully!',
      jobId: result.insertId
    });

  } catch (error) {
    console.error('❌ Create job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating job',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE JOB
// ==========================================
const updateJob = async (req, res) => {
  const userId = req.user.userId;
  const jobId = req.params.id;

  try {
    console.log('📝 Updating job:', jobId);

    const {
      jobTitle,
      industry,
      location,
      jobType,
      experienceLevel,
      salaryRange,
      description,
      requirements,
      benefits,
      status,
      expiryDays
    } = req.body;

    // Check if job belongs to user
    const [jobs] = await db.query(
      'SELECT * FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, userId]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or access denied'
      });
    }

    const current = jobs[0];

    // Calculate new expiry date if provided
    let expiryDate = current.expiry_date;
    if (expiryDays) {
      const newExpiryDate = new Date();
      newExpiryDate.setDate(newExpiryDate.getDate() + parseInt(expiryDays));
      expiryDate = newExpiryDate.toISOString().split('T')[0];
    }

    // Update job
    await db.query(
      `UPDATE jobs 
       SET job_title = ?, industry = ?, location = ?, job_type = ?,
           experience_level = ?, salary_range = ?, description = ?,
           requirements = ?, benefits = ?, status = ?, expiry_date = ?,
           updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        jobTitle || current.job_title,
        industry !== undefined ? industry : current.industry,
        location || current.location,
        jobType || current.job_type,
        experienceLevel || current.experience_level,
        salaryRange !== undefined ? salaryRange : current.salary_range,
        description || current.description,
        requirements !== undefined ? requirements : current.requirements,
        benefits !== undefined ? benefits : current.benefits,
        status || current.status,
        expiryDate,
        jobId,
        userId
      ]
    );

    console.log('✅ Job updated successfully');

    res.status(200).json({
      success: true,
      message: 'Job updated successfully'
    });

  } catch (error) {
    console.error('❌ Update job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating job',
      error: error.message
    });
  }
};

// ==========================================
// DELETE JOB
// ==========================================
const deleteJob = async (req, res) => {
  const userId = req.user.userId;
  const jobId = req.params.id;

  try {
    console.log('🗑️ Deleting job:', jobId);

    // Check if job belongs to user
    const [jobs] = await db.query(
      'SELECT id FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, userId]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or access denied'
      });
    }

    // Delete job (applications will be deleted automatically due to CASCADE)
    await db.query(
      'DELETE FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, userId]
    );

    // Decrement jobs_count
    await db.query(
      'UPDATE job_poster_profiles SET jobs_count = GREATEST(jobs_count - 1, 0) WHERE user_id = ?',
      [userId]
    );

    console.log('✅ Job deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Job deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting job',
      error: error.message
    });
  }
};

// ==========================================
// GET MY JOBS
// ==========================================
const getMyJobs = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [jobs] = await db.query(
      `SELECT * FROM jobs 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.status(200).json({
      success: true,
      jobs: jobs || [],
      count: jobs.length
    });

  } catch (error) {
    console.error('Get my jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching jobs',
      error: error.message
    });
  }
};

// ==========================================
// GET JOB APPLICATIONS (for a specific job)
// ==========================================
const getJobApplications = async (req, res) => {
  const userId = req.user.userId;
  const jobId = req.params.id;

  try {
    // Verify job belongs to user
    const [jobs] = await db.query(
      'SELECT id, job_title FROM jobs WHERE id = ? AND user_id = ?',
      [jobId, userId]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or access denied'
      });
    }

    // Get applications
    const [applications] = await db.query(
      `SELECT ja.*, mp.profile_photo, mp.cv_path, mp.job_title as applicant_job_title
       FROM job_applications ja
       LEFT JOIN manpower_profiles mp ON ja.applicant_user_id = mp.user_id
       WHERE ja.job_id = ?
       ORDER BY ja.applied_at DESC`,
      [jobId]
    );

    res.status(200).json({
      success: true,
      jobTitle: jobs[0].job_title,
      applications: applications || [],
      count: applications.length
    });

  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching applications',
      error: error.message
    });
  }
};

module.exports = {
  createJobPosterAccount,
  getJobPosterProfile,
  updateJobPosterProfile,
  createJob,
  updateJob,
  deleteJob,
  getMyJobs,
  getJobApplications
};