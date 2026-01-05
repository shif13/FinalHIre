// routes/jobSearchRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const {
  searchJobs,
  getJobDetails,
  getJobRecommendations,
  getFeaturedJobs,
  getJobCategories,
  saveJob,
  unsaveJob,
  getSavedJobs,
  checkJobSaved
} = require('../controllers/jobSearchController');

// ==========================================
// PUBLIC ROUTES
// ==========================================

// GET /api/job-search/search?query=...&location=...&industry=...
router.get('/search', searchJobs);

// GET /api/job-search/:id - Get job details
router.get('/:id', getJobDetails);

// GET /api/job-search/featured - Get featured jobs (for homepage)
router.get('/featured/all', getFeaturedJobs);

// GET /api/job-search/categories/all - Get job categories with counts
router.get('/categories/all', getJobCategories);

// ==========================================
// PROTECTED ROUTES (Manpower Users Only)
// ==========================================

// GET /api/job-search/recommendations/me - Get job recommendations
router.get('/recommendations/me', authenticateToken, getJobRecommendations);

// POST /api/job-search/save/:jobId - Save job
router.post('/save/:jobId', authenticateToken, saveJob);

// DELETE /api/job-search/unsave/:jobId - Remove saved job
router.delete('/unsave/:jobId', authenticateToken, unsaveJob);

// GET /api/job-search/saved/all - Get all saved jobs
router.get('/saved/all', authenticateToken, getSavedJobs);

// GET /api/job-search/check-saved/:jobId - Check if job is saved
router.get('/check-saved/:jobId', authenticateToken, checkJobSaved);

module.exports = router;