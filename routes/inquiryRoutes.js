// routes/inquiryRoutes.js - UPDATED WITH FILE UPLOAD SUPPORT
const express = require('express');
const router = express.Router();
const inquiryController = require('../controllers/inquiryController');
const { authenticateToken } = require('../middleware/auth');
const { uploadFields } = require('../middleware/upload'); // Multer for file uploads

// Send inquiry to manpower professional
router.post('/manpower', inquiryController.sendManpowerInquiry);

// Send inquiry to equipment owner
router.post('/equipment', inquiryController.sendEquipmentInquiry);

// Send job application ✅ WITH FILE UPLOAD SUPPORT
router.post('/job', uploadFields, inquiryController.sendJobApplication);

// Update application status (Job Poster only) ✅
router.put('/applications/:applicationId/status', authenticateToken, inquiryController.updateApplicationStatus);

module.exports = router;