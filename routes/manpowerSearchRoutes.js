// routes/manpowerSearchRoutes.js - CORRECTED
const express = require('express');
const router = express.Router();
const {
  searchManpower,
  getManpowerDetails,
  getSearchStats,
  getProfessionalCategories,
  getFeaturedManpower,
  refreshCategories  
} = require('../controllers/manpowerSearchController');

// Public search routes
router.post('/search', searchManpower);
router.get('/details/:manpowerId', getManpowerDetails);
router.get('/stats', getSearchStats);
router.get('/categories', getProfessionalCategories);
router.get('/featured', getFeaturedManpower);
router.get('/categories/refresh', refreshCategories);  

module.exports = router;