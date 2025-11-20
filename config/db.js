const mysql = require('mysql2/promise');
require('dotenv').config();

// Configuration object
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
  // Prevent connection timeout
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create the pool immediately
const pool = mysql.createPool(dbConfig);

console.log('✅ MySQL connection pool created');

// Test the connection immediately (async, non-blocking)
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    await connection.query('SELECT 1'); // Test query
    connection.release();
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message);
    console.error('❌ Please check your database configuration:');
    console.error(`   Host: ${process.env.DB_HOST}`);
    console.error(`   Database: ${process.env.DB_NAME}`);
    console.error(`   User: ${process.env.DB_USER}`);
    console.error(`   Port: ${process.env.DB_PORT || 3306}`);
  }
})();

// Keep connection alive with error handling
setInterval(async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    // Only log occasionally to reduce noise
    if (Date.now() % (5 * 60000) < 60000) { // Every 5 minutes
      console.log('✅ Database connection is alive');
    }
  } catch (err) {
    console.error('⚠️ MySQL ping failed:', err.message);
  }
}, 60000); // ping every 60 seconds

// Test connection function (for health checks)
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection test failed:', err.message);
    throw err;
  }
};

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('\n🛑 Closing database connections...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing database pool:', err.message);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, closing database connections...');
  try {
    await pool.end();
    console.log('✅ Database pool closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error closing database pool:', err.message);
    process.exit(1);
  }
});

// Export the pool (it's already created and ready to use)
module.exports = pool;
module.exports.testConnection = testConnection;