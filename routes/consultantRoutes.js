const express = require('express');
const router = express.Router();
const { uploadFields } = require('../middleware/upload');
const { authenticateToken } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/checkEmailVerified');
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
// PROTECTED ROUTES (Require Authentication)
// ==========================================

// GET /api/consultant/profile - Get consultant profile and all freelancer profiles
router.get('/profile', authenticateToken, getConsultantProfile);

// PUT /api/consultant/profile - Update consultant profile (NO verification required)
router.put('/profile', authenticateToken, uploadFields, updateConsultantProfile);

// ==========================================
// PROTECTED + VERIFIED ROUTES (Require Email Verification)
// ==========================================

// POST /api/consultant/freelancer - Add new freelancer profile (REQUIRES VERIFICATION)
router.post('/freelancer', authenticateToken, checkEmailVerified, uploadFields, addFreelancerProfile);

// PUT /api/consultant/freelancer/:id - Update freelancer profile (REQUIRES VERIFICATION)
router.put('/freelancer/:id', authenticateToken, checkEmailVerified, uploadFields, updateFreelancerProfile);

// DELETE /api/consultant/freelancer/:id - Delete freelancer profile (REQUIRES VERIFICATION)
router.delete('/freelancer/:id', authenticateToken, checkEmailVerified, deleteFreelancerProfile);

module.exports = router;