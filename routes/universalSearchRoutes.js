// routes/universalSearchRoutes.js
const express = require('express');
const router = express.Router();
const { universalSearch } = require('../controllers/universalSearchController');

// GET /api/universal-search?query=searchTerm
router.get('/', universalSearch);

module.exports = router;