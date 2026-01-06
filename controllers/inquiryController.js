const db = require('../config/db');
const emailService = require('../services/emailService');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// Helper function to upload to Cloudinary
const uploadToCloudinary = async (filePath, folder) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto'
    });
    
    // Delete local file after upload
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// ==========================================
// SEND INQUIRY TO MANPOWER
// ==========================================
const sendManpowerInquiry = async (req, res) => {
  try {
    const { manpowerId, name, email, phone, message, subject } = req.body;

    // Validation
    if (!manpowerId || !name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide manpower ID, name, email, and message'
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

    console.log('📧 Processing manpower inquiry:', { manpowerId, name, email });

    // Get manpower details
    const [manpower] = await db.query(
      'SELECT first_name, last_name, email, job_title FROM manpower_profiles WHERE id = ?',
      [manpowerId]
    );

    if (manpower.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Manpower profile not found'
      });
    }

    const profile = manpower[0];

    // Send emails to both parties
    await Promise.all([
      // Email to manpower professional
      emailService.sendManpowerInquiryEmail(
        {
          email: profile.email,
          firstName: profile.first_name,
          lastName: profile.last_name,
          jobTitle: profile.job_title
        },
        { name, email, phone, message, subject }
      ),
      // Confirmation email to inquirer
      emailService.sendInquiryConfirmationEmail(
        { email, name },
        {
          firstName: profile.first_name,
          lastName: profile.last_name,
          jobTitle: profile.job_title
        },
        'manpower'
      )
    ]);

    console.log('✅ Manpower inquiry emails sent successfully');

    res.status(200).json({
      success: true,
      message: 'Your inquiry has been sent successfully! The professional will contact you soon.'
    });

  } catch (error) {
    console.error('❌ Manpower inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending inquiry. Please try again later.',
      error: error.message
    });
  }
};

// ==========================================
// SEND INQUIRY TO EQUIPMENT OWNER
// ==========================================
const sendEquipmentInquiry = async (req, res) => {
  try {
    const { equipmentId, name, email, phone, message, subject } = req.body;

    // Validation
    if (!equipmentId || !name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide equipment ID, name, email, and message'
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

    console.log('📧 Processing equipment inquiry:', { equipmentId, name, email });

    // Get equipment and owner details
    const [equipment] = await db.query(
      `SELECT 
        e.equipment_name, 
        e.equipment_type, 
        e.user_id,
        eop.email, 
        eop.name, 
        eop.company_name
       FROM equipment e
       JOIN equipment_owner_profiles eop ON e.user_id = eop.user_id
       WHERE e.id = ?`,
      [equipmentId]
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found'
      });
    }

    const eq = equipment[0];

    // Send emails to both parties
    await Promise.all([
      // Email to equipment owner
      emailService.sendEquipmentInquiryEmail(
        {
          email: eq.email,
          name: eq.name,
          companyName: eq.company_name
        },
        {
          equipmentName: eq.equipment_name,
          equipmentType: eq.equipment_type
        },
        { name, email, phone, message, subject }
      ),
      // Confirmation email to inquirer
      emailService.sendInquiryConfirmationEmail(
        { email, name },
        {
          equipmentName: eq.equipment_name,
          ownerName: eq.name
        },
        'equipment'
      )
    ]);

    console.log('✅ Equipment inquiry emails sent successfully');

    res.status(200).json({
      success: true,
      message: 'Your inquiry has been sent successfully! The owner will contact you soon.'
    });

  } catch (error) {
    console.error('❌ Equipment inquiry error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending inquiry. Please try again later.',
      error: error.message
    });
  }
};

// ==========================================
// SEND JOB APPLICATION (WITH FILE UPLOADS)
// ==========================================
const sendJobApplication = async (req, res) => {
  try {
    console.log('📧 Job Application Request:', {
      body: req.body,
      files: req.files
    });

    const { jobId, name, email, phone, message } = req.body;
    const userId = req.user?.userId; // Optional - user might not be logged in

    // Validation
    if (!jobId || !name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide job ID, name, email, and message'
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

    console.log('📧 Processing job application:', { jobId, name, email });

    // Get job and company details
    const [jobs] = await db.query(
      `SELECT 
        j.id, j.job_title, j.company_name, j.user_id,
        jpp.email as company_email, jpp.name as poster_name
       FROM jobs j
       JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
       WHERE j.id = ? AND j.status = 'open'`,
      [jobId]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found or no longer accepting applications'
      });
    }

    const job = jobs[0];

    // Handle file uploads
    let cvUrl = null;
    let photoUrl = null;

    if (req.files) {
      // Upload CV if provided
      if (req.files.cv && req.files.cv[0]) {
        console.log('📄 Uploading CV to Cloudinary...');
        cvUrl = await uploadToCloudinary(req.files.cv[0].path, 'job_applications/cvs');
        console.log('✅ CV uploaded:', cvUrl);
      }

      // Upload photo if provided
      if (req.files.photo && req.files.photo[0]) {
        console.log('📸 Uploading photo to Cloudinary...');
        photoUrl = await uploadToCloudinary(req.files.photo[0].path, 'job_applications/photos');
        console.log('✅ Photo uploaded:', photoUrl);
      }
    }

    // Check if already applied (if user is logged in)
    if (userId) {
      const [existing] = await db.query(
        'SELECT id FROM job_applications WHERE job_id = ? AND applicant_user_id = ?',
        [jobId, userId]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'You have already applied to this job'
        });
      }
    }

    // Record application with CV and photo URLs (for both logged-in and guest users)
    await db.query(
      `INSERT INTO job_applications 
      (job_id, applicant_user_id, applicant_name, applicant_email, applicant_phone, cover_message, cv_path, photo_path) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [jobId, userId || null, name, email, phone || null, message, cvUrl, photoUrl]
    );

    // Increment applications count
    await db.query(
      'UPDATE jobs SET applications_count = applications_count + 1 WHERE id = ?',
      [jobId]
    );

    // Send emails to both parties
    await Promise.all([
      // Email to job poster
      emailService.sendJobApplicationEmail(
        {
          email: job.company_email,
          posterName: job.poster_name,
          companyName: job.company_name,
          jobTitle: job.job_title
        },
        { name, email, phone, message, cvUrl, photoUrl }
      ),
      // Confirmation email to applicant
      emailService.sendApplicationConfirmationEmail(
        { email, name },
        {
          jobTitle: job.job_title,
          companyName: job.company_name
        }
      )
    ]);

    console.log('✅ Job application emails sent successfully');

    res.status(200).json({
      success: true,
      message: 'Your application has been sent successfully! The company will contact you soon.'
    });

  } catch (error) {
    console.error('❌ Job application error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending application. Please try again later.',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE APPLICATION STATUS
// ==========================================
const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    // Validate status
    const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Verify the application belongs to a job posted by this user
    const [applications] = await db.query(
      `SELECT ja.*, j.user_id as job_poster_id
       FROM job_applications ja
       JOIN jobs j ON ja.job_id = j.id
       WHERE ja.id = ?`,
      [applicationId]
    );

    if (applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    if (applications[0].job_poster_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update status
    await db.query(
      'UPDATE job_applications SET application_status = ? WHERE id = ?',
      [status, applicationId]
    );

    console.log(`✅ Application ${applicationId} status updated to ${status}`);

    res.status(200).json({
      success: true,
      message: 'Application status updated successfully'
    });

  } catch (error) {
    console.error('❌ Update application status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating application status',
      error: error.message
    });
  }
};

module.exports = {
  sendManpowerInquiry,
  sendEquipmentInquiry,
  sendJobApplication,
  updateApplicationStatus
};