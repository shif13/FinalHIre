// routes/consultantRoutes.js
const express = require('express');
const router = express.Router();
const { uploadFields } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');

const { 
  createConsultantAccount,
  getConsultantProfile,
  updateConsultantProfile,
  addFreelancerProfile,
  updateFreelancerProfile,
  deleteFreelancerProfile
} = require('../controllers/consultantController');

// PUBLIC ROUTES
// POST /api/consultant/signup - Consultant signup
router.post('/signup', uploadFields, createConsultantAccount);

// ==========================================
// PROTECTED ROUTES (Require Authentication ONLY)
// ==========================================

// GET /api/consultant/profile - Get consultant profile and all freelancer profiles
router.get('/profile', authenticateToken, getConsultantProfile);

// PUT /api/consultant/profile - Update consultant profile
router.put('/profile', authenticateToken, uploadFields, updateConsultantProfile);

router.post('/freelancer', authenticateToken, uploadFields, addFreelancerProfile);

router.put('/freelancer/:id', authenticateToken, uploadFields, updateFreelancerProfile);

router.delete('/freelancer/:id', authenticateToken, deleteFreelancerProfile);

module.exports = router;