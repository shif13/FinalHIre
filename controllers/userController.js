const db = require('../config/db');

// UPDATED: Remove email_verified and verification columns
const createUsersTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      location VARCHAR(255) NOT NULL,
      user_type ENUM('manpower', 'equipment_owner', 'consultant') NOT NULL,
      is_active BOOLEAN DEFAULT true,
      reset_token VARCHAR(255),
      reset_token_expiry TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      INDEX idx_email (email),
      INDEX idx_user_type (user_type),
      INDEX idx_location (location),
      INDEX idx_mobile (mobile_number),
      INDEX idx_name (first_name, last_name),
      UNIQUE KEY unique_email_role (email, user_type)
    )
  `;

  try {
    await db.query(createTableQuery);
    console.log('✅ Users table created or already exists');
  } catch (error) {
    console.error('❌ Error creating users table:', error);
    throw error;
  }
};

// Remove verification columns from existing tables
const removeVerificationColumns = async () => {
  try {
    // Check if email_verified column exists
    const [emailVerifiedColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'email_verified'
    `);

    if (emailVerifiedColumn.length > 0) {
      console.log('🔄 Removing email_verified column...');
      await db.query('ALTER TABLE users DROP COLUMN email_verified');
      console.log('✅ email_verified column removed');
    }

    // Check if verification_token column exists
    const [tokenColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'verification_token'
    `);

    if (tokenColumn.length > 0) {
      console.log('🔄 Removing verification_token column...');
      await db.query('ALTER TABLE users DROP COLUMN verification_token');
      console.log('✅ verification_token column removed');
    }

    // Check if verification_token_expiry column exists
    const [tokenExpiryColumn] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'verification_token_expiry'
    `);

    if (tokenExpiryColumn.length > 0) {
      console.log('🔄 Removing verification_token_expiry column...');
      await db.query('ALTER TABLE users DROP COLUMN verification_token_expiry');
      console.log('✅ verification_token_expiry column removed');
    }

    // Remove index on verification_token if it exists
    const [tokenIndex] = await db.query(`
      SHOW INDEXES FROM users WHERE Key_name = 'idx_verification_token'
    `);

    if (tokenIndex.length > 0) {
      console.log('🔄 Removing idx_verification_token index...');
      await db.query('ALTER TABLE users DROP INDEX idx_verification_token');
      console.log('✅ idx_verification_token index removed');
    }

  } catch (error) {
    console.error('❌ Error removing verification columns:', error);
    // Don't throw - allow app to continue
  }
};

// Update existing table to remove UNIQUE constraint from email (if exists)
const updateUsersTableSchema = async () => {
  try {
    // Check if the unique constraint exists on email alone
    const [indexes] = await db.query(`
      SHOW INDEXES FROM users WHERE Key_name = 'email'
    `);

    if (indexes.length > 0 && indexes[0].Non_unique === 0) {
      console.log('🔄 Removing unique constraint from email column...');
      await db.query(`ALTER TABLE users DROP INDEX email`);
      console.log('✅ Unique constraint removed from email');
    }

    // Check if idx_email index exists before adding
    const [idxEmailExists] = await db.query(`
      SHOW INDEXES FROM users WHERE Key_name = 'idx_email'
    `);

    if (idxEmailExists.length === 0) {
      await db.query(`ALTER TABLE users ADD INDEX idx_email (email)`);
      console.log('✅ Regular index added for email');
    }

    // Add unique constraint on email + user_type combination if it doesn't exist
    const [compositeIndexes] = await db.query(`
      SHOW INDEXES FROM users WHERE Key_name = 'unique_email_role'
    `);

    if (compositeIndexes.length === 0) {
      console.log('🔄 Adding unique constraint on email + user_type...');
      await db.query(`
        ALTER TABLE users 
        ADD UNIQUE KEY unique_email_role (email, user_type)
      `);
      console.log('✅ Unique constraint added for email + user_type combination');
    }

  } catch (error) {
    console.error('❌ Error updating users table schema:', error);
  }
};

// Update user_type ENUM to include 'consultant' (for existing tables)
const updateUserTypeEnum = async () => {
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
        console.log('🔄 Updating user_type ENUM to include consultant...');
        
        await db.query(`
          ALTER TABLE users 
          MODIFY COLUMN user_type ENUM('manpower', 'equipment_owner', 'consultant') NOT NULL
        `);
        
        console.log('✅ user_type ENUM updated successfully');
      }
    }
  } catch (error) {
    console.error('❌ Error updating user_type ENUM:', error);
  }
};

// Initialize table on module load
(async () => {
  try {
    await createUsersTable();
    await updateUsersTableSchema();
    await updateUserTypeEnum();
    await removeVerificationColumns(); // ✅ NEW: Remove verification columns
  } catch (error) {
    console.error('Failed to initialize users table:', error);
  }
})();

// Create user in users table (called by manpower/equipment/consultant controllers)
const createUser = async (userData) => {
  const {
    first_name,
    last_name,
    email,
    password,
    mobile_number,
    whatsapp_number,
    location,
    user_type
  } = userData;

  try {
    const insertQuery = `
      INSERT INTO users 
      (first_name, last_name, email, password, mobile_number, whatsapp_number, location, user_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)
    `;

    const [result] = await db.query(insertQuery, [
      first_name,
      last_name,
      email,
      password,
      mobile_number,
      whatsapp_number || mobile_number,
      location,
      user_type
    ]);

    console.log(`✅ User created in users table: ${email} (ID: ${result.insertId}, type: ${user_type})`);
    return { success: true, userId: result.insertId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new Error(`An account with email ${email} and role ${user_type} already exists`);
    }
    console.error('❌ Error creating user in users table:', error);
    throw error;
  }
};

// Get user by email (used by login controller)
const getUserByEmail = async (email) => {
  try {
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, password, mobile_number, whatsapp_number, 
              location, user_type, is_active, created_at, last_login
       FROM users 
       WHERE email = ?`,
      [email]
    );

    return users;
  } catch (error) {
    console.error('❌ Error fetching user by email:', error);
    throw error;
  }
};

// Get user by ID (used by various controllers)
const getUserById = async (id) => {
  try {
    const [users] = await db.query(
      `SELECT id, first_name, last_name, email, mobile_number, whatsapp_number, 
              location, user_type, is_active, created_at, updated_at, last_login
       FROM users 
       WHERE id = ?`,
      [id]
    );

    if (users.length === 0) {
      return null;
    }

    return users[0];
  } catch (error) {
    console.error('❌ Error fetching user by ID:', error);
    throw error;
  }
};

// Update last login timestamp
const updateLastLogin = async (userId) => {
  try {
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      [userId]
    );
    console.log(`✅ Last login updated for user: ${userId}`);
  } catch (error) {
    console.error('❌ Error updating last login:', error);
    throw error;
  }
};

// Check if email exists with specific role
const checkEmailExists = async (email, userType = null) => {
  try {
    let query = 'SELECT id, user_type FROM users WHERE email = ?';
    const params = [email];
    
    if (userType) {
      query += ' AND user_type = ?';
      params.push(userType);
    }
    
    const [users] = await db.query(query, params);
    return users.length > 0;
  } catch (error) {
    console.error('❌ Error checking email existence:', error);
    throw error;
  }
};

// Check if email + role combination exists
const checkEmailRoleExists = async (email, userType) => {
  try {
    const [users] = await db.query(
      'SELECT id FROM users WHERE email = ? AND user_type = ?',
      [email, userType]
    );
    return users.length > 0;
  } catch (error) {
    console.error('❌ Error checking email+role existence:', error);
    throw error;
  }
};

// Get all roles for an email
const getRolesByEmail = async (email) => {
  try {
    const [users] = await db.query(
      'SELECT user_type FROM users WHERE email = ? AND is_active = true',
      [email]
    );
    return users.map(u => u.user_type);
  } catch (error) {
    console.error('❌ Error fetching roles by email:', error);
    throw error;
  }
};

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  updateLastLogin,
  checkEmailExists,
  checkEmailRoleExists,
  getRolesByEmail
};