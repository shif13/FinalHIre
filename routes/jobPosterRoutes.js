// routes/jobPosterRoutes.js
const express = require('express');
const router = express.Router();
const { uploadFields } = require('../middleware/upload');
const { authenticateToken, checkUserType } = require('../middleware/auth');

const { 
  createJobPosterAccount,
  getJobPosterProfile,
  updateJobPosterProfile,
  createJob,
  updateJob,
  deleteJob,
  getMyJobs,
  getJobApplications
} = require('../controllers/jobPosterController');

// ==========================================
// PUBLIC ROUTES
// ==========================================

// POST /api/job-poster/signup - Job poster signup
router.post('/signup', uploadFields, createJobPosterAccount);

// ==========================================
// PROTECTED ROUTES (Require Authentication)
// ==========================================

// GET /api/job-poster/profile - Get job poster profile and all posted jobs
router.get('/profile', authenticateToken, getJobPosterProfile);

// PUT /api/job-poster/profile - Update job poster profile
router.put('/profile', authenticateToken, uploadFields, updateJobPosterProfile);

// POST /api/job-poster/jobs - Create new job
router.post('/jobs', authenticateToken, createJob);

// GET /api/job-poster/jobs - Get all my jobs
router.get('/jobs', authenticateToken, getMyJobs);

// PUT /api/job-poster/jobs/:id - Update job
router.put('/jobs/:id', authenticateToken, updateJob);

// DELETE /api/job-poster/jobs/:id - Delete job
router.delete('/jobs/:id', authenticateToken, deleteJob);

// GET /api/job-poster/jobs/:id/applications - Get applications for a specific job
router.get('/jobs/:id/applications', authenticateToken, getJobApplications);

module.exports = router;