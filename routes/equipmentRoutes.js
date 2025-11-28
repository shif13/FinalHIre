// routes/equipmentRoutes.js
const express = require('express');
const router = express.Router();
const { uploadFields } = require('../middleware/upload');
const { authenticateToken, checkUserType } = require('../middleware/auth');
const { 
  createEquipmentOwnerAccount,
  getEquipmentOwnerProfile,
  updateEquipmentOwnerProfile,
  addEquipment,
  updateEquipment,
  deleteEquipment,
  getOwnerProfile,
  uploadEquipmentImages,
  uploadEquipmentDocuments
} = require('../controllers/equipmentController');

// ==========================================
// PUBLIC ROUTES
// ==========================================

// POST /api/equipment/signup - Equipment owner signup
router.post('/signup', uploadFields, createEquipmentOwnerAccount);

// GET /api/equipment-search/owner-profile/:userId - Get owner profile by user ID
router.get('/owner-profile/:userId', getOwnerProfile);

// ==========================================
// PROTECTED ROUTES (Require Authentication)
// ==========================================

// GET /api/equipment/profile - Get equipment owner profile and equipment list
router.get('/profile', authenticateToken, getEquipmentOwnerProfile);

// PUT /api/equipment/profile - Update equipment owner profile
router.put('/profile', authenticateToken, uploadFields, updateEquipmentOwnerProfile);

// POST /api/equipment/upload-images - Upload equipment images to Cloudinary
router.post('/upload-images', authenticateToken, uploadFields, uploadEquipmentImages);

// POST /api/equipment/upload-documents - Upload equipment documents to Cloudinary
router.post('/upload-documents', authenticateToken, uploadFields, uploadEquipmentDocuments);

// POST /api/equipment/add - Add new equipment
router.post('/add', authenticateToken, addEquipment);

// PUT /api/equipment/update/:id - Update equipment
router.put('/update/:id', authenticateToken, updateEquipment);

// DELETE /api/equipment/delete/:id - Delete equipment
router.delete('/delete/:id', authenticateToken, deleteEquipment);

// ==========================================
// ALTERNATIVE RESTFUL ROUTES (Keep for backward compatibility)
// ==========================================

// POST /api/equipment - Add new equipment
router.post('/', authenticateToken, addEquipment);

// PUT /api/equipment/:id - Update equipment
router.put('/:id', authenticateToken, updateEquipment);

// DELETE /api/equipment/:id - Delete equipment
router.delete('/:id', authenticateToken, deleteEquipment);

module.exports = router;