const db = require('../config/db');
const bcrypt = require('bcrypt');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const { createUser, checkEmailRoleExists } = require('./userController');
const emailService = require('../services/emailService');

// ==========================================
// CREATE EQUIPMENT OWNER PROFILES TABLE
// ==========================================
const createEquipmentOwnerProfilesTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS equipment_owner_profiles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      location VARCHAR(255) NOT NULL,
      company_name VARCHAR(255),
      profile_photo VARCHAR(500),
      equipment_count INT DEFAULT 0,
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
    console.log('✅ Equipment owner profiles table created or already exists');
  } catch (error) {
    console.error('❌ Error creating equipment owner profiles table:', error);
    throw error;
  }
};

// ==========================================
// CREATE EQUIPMENT TABLE - WITH DOCUMENTS SUPPORT
// ==========================================
const createEquipmentTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS equipment (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      equipment_name VARCHAR(255) NOT NULL,
      equipment_type VARCHAR(100) NOT NULL,
      availability ENUM('available', 'on-hire') DEFAULT 'available',
      location VARCHAR(255),
      contact_person VARCHAR(200) NOT NULL,
      contact_number VARCHAR(20) NOT NULL,
      contact_email VARCHAR(255) NOT NULL,
      description TEXT,
      equipment_images JSON,
      equipment_documents JSON,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_equipment_type (equipment_type),
      INDEX idx_availability (availability),
      INDEX idx_location (location)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Equipment table created or already exists');
    
    // Add equipment_documents column if it doesn't exist (for existing tables)
    try {
      // Check if column exists first
      const [columns] = await db.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'equipment' 
        AND COLUMN_NAME = 'equipment_documents'
      `);

      if (columns.length === 0) {
        // Column doesn't exist, add it
        await db.query(`
          ALTER TABLE equipment 
          ADD COLUMN equipment_documents JSON AFTER equipment_images
        `);
        console.log('✅ Added equipment_documents column');
      } else {
        console.log('ℹ️ equipment_documents column already exists');
      }
    } catch (alterError) {
      console.error('❌ Error checking/adding equipment_documents column:', alterError);
    }
  } catch (error) {
    console.error('❌ Error creating equipment table:', error);
    throw error;
  }
};

// Initialize both tables on module load
(async () => {
  try {
    await createEquipmentOwnerProfilesTable();
    await createEquipmentTable();
  } catch (error) {
    console.error('Failed to initialize equipment tables:', error);
  }
})();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Upload image to Cloudinary
const uploadToCloudinary = async (filePath, folder = 'equipment_images') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto',
      transformation: folder === 'equipment_images' ? [
        { width: 1200, height: 900, crop: 'fill' },
        { quality: 'auto' }
      ] : undefined
    });
    
    fs.unlinkSync(filePath);
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};

// Upload profile photo
const uploadProfilePhoto = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'equipment_owner_profiles',
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
const deleteFromCloudinary = async (fileUrl) => {
  try {
    if (!fileUrl) return;
    
    const matches = fileUrl.match(/\/(equipment_images|equipment_owner_profiles|equipment_documents)\/([^\.]+)/);
    if (matches && matches[1] && matches[2]) {
      const publicId = `${matches[1]}/${matches[2]}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
      console.log('🗑️ Deleted from Cloudinary:', publicId);
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
};

// ==========================================
// CREATE EQUIPMENT OWNER ACCOUNT (SIGNUP)
// ==========================================
const createEquipmentOwnerAccount = async (req, res) => {
  console.log('🎯 createEquipmentOwnerAccount called');
  console.log('📦 Body:', req.body);
  console.log('📎 Files:', req.files);

  try {
    const {
      name,
      email,
      password,
      companyName,
      location,
      mobileNumber,
      whatsappNumber
    } = req.body;

    // Validation
    if (!name || !email || !password || !mobileNumber || !location) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
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

    // Check if email exists with 'equipment_owner' role
    const emailRoleExists = await checkEmailRoleExists(email, 'equipment_owner');
    if (emailRoleExists) {
      return res.status(400).json({
        success: false,
        message: 'You already have an Equipment Supplier account with this email. Please login or use a different email.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle profile photo upload to Cloudinary
    let profilePhotoUrl = null;
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      try {
        console.log('📸 Uploading profile photo to Cloudinary...');
        profilePhotoUrl = await uploadProfilePhoto(req.files.profilePhoto[0].path);
        console.log('✅ Profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error uploading profile photo'
        });
      }
    }

    // Auto-fill WhatsApp with mobile if not provided
    const finalWhatsappNumber = whatsappNumber || mobileNumber;

    // Step 1: Create user in users table
    console.log('👤 Creating user in users table...');
    const userResult = await createUser({
      first_name: name.split(' ')[0] || name,
      last_name: name.split(' ').slice(1).join(' ') || '',
      email,
      password: hashedPassword,
      mobile_number: mobileNumber,
      whatsapp_number: finalWhatsappNumber,
      location,
      user_type: 'equipment_owner'
    });

    const userId = userResult.userId;
    console.log('✅ User created with ID:', userId);

    // Step 2: Create equipment owner profile
    console.log('🏢 Creating equipment owner profile...');
    await db.query(
      `INSERT INTO equipment_owner_profiles 
      (user_id, name, email, mobile_number, whatsapp_number, location, company_name, profile_photo, equipment_count) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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

    console.log(`✅ Equipment owner account created: ${email} (User ID: ${userId})`);

    // Send welcome email asynchronously (don't wait for it)
    emailService.sendWelcomeEmail({
      email,
      firstName: name.split(' ')[0] || name,
      lastName: name.split(' ').slice(1).join(' ') || '',
      userType: 'equipment_owner'
    }).then(() => {
      console.log('✅ Welcome email sent to:', email);
    }).catch(emailError => {
      console.error('⚠️ Welcome email failed:', emailError.message);
    });

    // Respond immediately without waiting for email
    res.status(201).json({
      success: true,
      message: 'Equipment owner account created successfully',
      userId: userId
    });

  } catch (error) {
    console.error('❌ Equipment owner signup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account',
      error: error.message
    });
  }
};

// ==========================================
// GET EQUIPMENT OWNER PROFILE & EQUIPMENT LIST
// ==========================================
const getEquipmentOwnerProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔍 Fetching equipment owner profile for user:', userId);

    // Get owner profile
    const [profiles] = await db.query(
      `SELECT eop.*, u.is_active, u.email_verified, u.created_at as account_created
       FROM equipment_owner_profiles eop
       JOIN users u ON eop.user_id = u.id
       WHERE eop.user_id = ?`,
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const profile = profiles[0];

    // Get equipment list with documents
    const [equipment] = await db.query(
      `SELECT * FROM equipment WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    // Parse JSON fields safely
    const equipmentList = equipment.map(eq => {
      let parsedImages = [];
      let parsedDocuments = [];

      try {
        if (Buffer.isBuffer(eq.equipment_images)) {
          parsedImages = JSON.parse(eq.equipment_images.toString('utf8'));
        } else if (typeof eq.equipment_images === 'string' && eq.equipment_images.trim()) {
          parsedImages = JSON.parse(eq.equipment_images);
        } else if (Array.isArray(eq.equipment_images)) {
          parsedImages = eq.equipment_images;
        }
      } catch (e) {
        console.error('Error parsing equipment images:', e);
        parsedImages = [];
      }

      try {
        if (Buffer.isBuffer(eq.equipment_documents)) {
          parsedDocuments = JSON.parse(eq.equipment_documents.toString('utf8'));
        } else if (typeof eq.equipment_documents === 'string' && eq.equipment_documents.trim()) {
          parsedDocuments = JSON.parse(eq.equipment_documents);
        } else if (Array.isArray(eq.equipment_documents)) {
          parsedDocuments = eq.equipment_documents;
        }
      } catch (e) {
        console.error('Error parsing equipment documents:', e);
        parsedDocuments = [];
      }

      return {
        ...eq,
        equipment_images: parsedImages,
        equipment_documents: parsedDocuments
      };
    });

    console.log(`✅ Profile and ${equipmentList.length} equipment items fetched`);

    res.status(200).json({
      success: true,
      profile,
      equipment: equipmentList
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE EQUIPMENT OWNER PROFILE
// ==========================================
const updateEquipmentOwnerProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log('🔄 Updating equipment owner profile for user:', userId);
    console.log('📦 Body:', req.body);
    console.log('📎 Files:', req.files);

    const {
      name,
      companyName,
      location,
      mobileNumber,
      whatsappNumber,
      removePhoto
    } = req.body;

    // Get current profile
    const [currentProfile] = await db.query(
      'SELECT * FROM equipment_owner_profiles WHERE user_id = ?',
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
        
        // Delete old photo from Cloudinary
        if (current.profile_photo) {
          await deleteFromCloudinary(current.profile_photo);
        }
        
        // Upload new photo
        profilePhotoUrl = await uploadProfilePhoto(req.files.profilePhoto[0].path);
        console.log('✅ New profile photo uploaded:', profilePhotoUrl);
      } catch (error) {
        console.error('❌ Error updating profile photo:', error);
      }
    }

    // Update equipment owner profile
    await db.query(
      `UPDATE equipment_owner_profiles 
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
    await db.query(
      `UPDATE users 
       SET first_name = ?, mobile_number = ?, whatsapp_number = ?, location = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name || current.name,
        mobileNumber || current.mobile_number,
        whatsappNumber || current.whatsapp_number,
        location || current.location,
        userId
      ]
    );

    console.log('✅ Equipment owner profile updated successfully');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profilePhotoUrl: profilePhotoUrl || null
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
// UPLOAD EQUIPMENT DOCUMENTS TO CLOUDINARY
// ==========================================
const uploadEquipmentDocuments = async (req, res) => {
  try {
    console.log('📤 Upload equipment documents called');
    console.log('📎 Files:', req.files);

    if (!req.files || !req.files.equipmentDocuments) {
      return res.status(400).json({
        success: false,
        message: 'No documents provided'
      });
    }

    // Handle both single and multiple files
    const files = Array.isArray(req.files.equipmentDocuments) 
      ? req.files.equipmentDocuments 
      : [req.files.equipmentDocuments];

    console.log('📤 Uploading', files.length, 'documents to Cloudinary...');

    // Upload all documents to Cloudinary
    const uploadPromises = files.map(file => 
      uploadToCloudinary(file.path, 'equipment_documents')
    );
    const documentUrls = await Promise.all(uploadPromises);

    console.log('✅ Documents uploaded to Cloudinary:', documentUrls);

    res.status(200).json({
      success: true,
      documentUrls: documentUrls,
      count: documentUrls.length
    });

  } catch (error) {
    console.error('❌ Document upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading documents',
      error: error.message
    });
  }
};

// ==========================================
// ADD EQUIPMENT WITH DOCUMENTS
// ==========================================
const addEquipment = async (req, res) => {
  const userId = req.user.userId;
  const startTime = Date.now();

  try {
    console.log('➕ Adding equipment for user:', userId);
    console.log('📦 Body:', req.body);

    const {
      equipmentName,
      equipmentType,
      availability,
      location,
      contactPerson,
      contactNumber,
      contactEmail,
      description,
      equipmentImages,
      equipmentDocuments
    } = req.body;

    // Validation
    if (!equipmentName || !equipmentType || !contactPerson || !contactNumber || !contactEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required fields'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid contact email'
      });
    }

    console.log('📸 Images provided:', equipmentImages?.length || 0);
    console.log('📄 Documents provided:', equipmentDocuments?.length || 0);

    // Insert equipment with documents
    const [result] = await db.query(
      `INSERT INTO equipment 
      (user_id, equipment_name, equipment_type, availability, location, 
       contact_person, contact_number, contact_email, description, 
       equipment_images, equipment_documents) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        equipmentName.trim(),
        equipmentType.trim(),
        availability || 'available',
        location ? location.trim() : null,
        contactPerson.trim(),
        contactNumber.trim(),
        contactEmail.trim().toLowerCase(),
        description ? description.trim() : null,
        JSON.stringify(equipmentImages || []),
        JSON.stringify(equipmentDocuments || [])
      ]
    );

    // Increment equipment_count in equipment_owner_profiles
    await db.query(
      'UPDATE equipment_owner_profiles SET equipment_count = equipment_count + 1 WHERE user_id = ?',
      [userId]
    );

    const responseTime = Date.now() - startTime;
    console.log(`✅ Equipment added with ID: ${result.insertId} in ${responseTime}ms`);

    res.status(201).json({
      success: true,
      message: 'Equipment added successfully!',
      equipment: {
        id: result.insertId,
        equipmentName: equipmentName.trim(),
        equipmentType: equipmentType.trim(),
        availability: availability || 'available',
        equipmentImages: equipmentImages || [],
        equipmentDocuments: equipmentDocuments || []
      },
      processingTime: `${responseTime}ms`
    });

  } catch (error) {
    console.error('❌ Add equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding equipment',
      error: error.message
    });
  }
};

// ==========================================
// UPDATE EQUIPMENT WITH DOCUMENTS
// ==========================================
const updateEquipment = async (req, res) => {
  const userId = req.user.userId;
  const equipmentId = req.params.id;

  try {
    console.log('🔄 Updating equipment:', equipmentId);

    const {
      equipmentName,
      equipmentType,
      availability,
      location,
      contactPerson,
      contactNumber,
      contactEmail,
      description,
      equipmentImages,
      equipmentDocuments
    } = req.body;

    // Check if equipment belongs to user
    const [equipment] = await db.query(
      'SELECT * FROM equipment WHERE id = ? AND user_id = ?',
      [equipmentId, userId]
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found or access denied'
      });
    }

    // Update equipment with documents
    await db.query(
      `UPDATE equipment 
       SET equipment_name = ?, equipment_type = ?, availability = ?,
           location = ?, contact_person = ?, contact_number = ?,
           contact_email = ?, description = ?, equipment_images = ?,
           equipment_documents = ?, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      [
        equipmentName ? equipmentName.trim() : null,
        equipmentType ? equipmentType.trim() : null,
        availability || 'available',
        location ? location.trim() : null,
        contactPerson ? contactPerson.trim() : null,
        contactNumber ? contactNumber.trim() : null,
        contactEmail ? contactEmail.trim().toLowerCase() : null,
        description ? description.trim() : null,
        JSON.stringify(equipmentImages || []),
        JSON.stringify(equipmentDocuments || []),
        equipmentId,
        userId
      ]
    );

    console.log('✅ Equipment updated successfully');

    res.status(200).json({
      success: true,
      message: 'Equipment updated successfully'
    });

  } catch (error) {
    console.error('❌ Update equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating equipment',
      error: error.message
    });
  }
};

// ==========================================
// DELETE EQUIPMENT
// ==========================================
const deleteEquipment = async (req, res) => {
  const userId = req.user.userId;
  const equipmentId = req.params.id;

  try {
    console.log('🗑️ Deleting equipment:', equipmentId);

    // Check if equipment belongs to user
    const [equipment] = await db.query(
      'SELECT equipment_images, equipment_documents FROM equipment WHERE id = ? AND user_id = ?',
      [equipmentId, userId]
    );

    if (equipment.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Equipment not found or access denied'
      });
    }

    // Delete equipment images from Cloudinary
    try {
      let images = [];
      if (Buffer.isBuffer(equipment[0].equipment_images)) {
        images = JSON.parse(equipment[0].equipment_images.toString('utf8'));
      } else if (typeof equipment[0].equipment_images === 'string') {
        images = JSON.parse(equipment[0].equipment_images);
      } else if (Array.isArray(equipment[0].equipment_images)) {
        images = equipment[0].equipment_images;
      }

      for (const imageUrl of images) {
        await deleteFromCloudinary(imageUrl);
      }
    } catch (e) {
      console.error('Error deleting equipment images:', e);
    }

    // Delete equipment documents from Cloudinary
    try {
      let documents = [];
      if (Buffer.isBuffer(equipment[0].equipment_documents)) {
        documents = JSON.parse(equipment[0].equipment_documents.toString('utf8'));
      } else if (typeof equipment[0].equipment_documents === 'string') {
        documents = JSON.parse(equipment[0].equipment_documents);
      } else if (Array.isArray(equipment[0].equipment_documents)) {
        documents = equipment[0].equipment_documents;
      }

      for (const docUrl of documents) {
        await deleteFromCloudinary(docUrl);
      }
    } catch (e) {
      console.error('Error deleting equipment documents:', e);
    }

    // Delete equipment
    await db.query(
      'DELETE FROM equipment WHERE id = ? AND user_id = ?',
      [equipmentId, userId]
    );

    // Decrement equipment_count
    await db.query(
      'UPDATE equipment_owner_profiles SET equipment_count = GREATEST(equipment_count - 1, 0) WHERE user_id = ?',
      [userId]
    );

    console.log('✅ Equipment deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Equipment deleted successfully'
    });

  } catch (error) {
    console.error('❌ Delete equipment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting equipment',
      error: error.message
    });
  }
};

// ==========================================
// UPLOAD EQUIPMENT IMAGES
// ==========================================
const uploadEquipmentImages = async (req, res) => {
  try {
    console.log('📤 Upload equipment images called');
    console.log('📎 Files:', req.files);

    if (!req.files || !req.files.equipmentImages) {
      return res.status(400).json({
        success: false,
        message: 'No images provided'
      });
    }

    // Handle both single and multiple files
    const files = Array.isArray(req.files.equipmentImages) 
      ? req.files.equipmentImages 
      : [req.files.equipmentImages];

    console.log('📤 Uploading', files.length, 'images to Cloudinary...');

    // Upload all images to Cloudinary
    const uploadPromises = files.map(file => uploadToCloudinary(file.path));
    const imageUrls = await Promise.all(uploadPromises);

    console.log('✅ Images uploaded to Cloudinary:', imageUrls);

    res.status(200).json({
      success: true,
      imageUrls: imageUrls,
      count: imageUrls.length
    });

  } catch (error) {
    console.error('❌ Image upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading images',
      error: error.message
    });
  }
};

// ==========================================
// GET OWNER PROFILE (Public Access)
// ==========================================
const getOwnerProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        eop.name,
        eop.email,
        eop.mobile_number,
        eop.whatsapp_number,
        eop.location,
        eop.company_name,
        eop.profile_photo,
        eop.equipment_count
      FROM equipment_owner_profiles eop
      WHERE eop.user_id = ?
    `;
    
    const [results] = await db.query(query, [userId]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        msg: 'Owner profile not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: results[0]
    });
  } catch (error) {
    console.error('Get owner profile error:', error);
    res.status(500).json({
      success: false,
      msg: 'Error fetching owner profile',
      error: error.message
    });
  }
};

module.exports = {
  createEquipmentOwnerAccount,
  getEquipmentOwnerProfile,
  updateEquipmentOwnerProfile,
  addEquipment,
  updateEquipment,
  deleteEquipment,
  getOwnerProfile,
  uploadEquipmentImages,
  uploadEquipmentDocuments
};