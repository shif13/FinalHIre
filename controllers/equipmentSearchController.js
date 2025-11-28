// controllers/equipmentSearchController.js - WITH DOCUMENTS SUPPORT
const db = require('../config/db');
const { buildLocationQuery } = require('./locationSearchHelper');

// ==========================================
// SEARCH EQUIPMENT (Public Access)
// ==========================================
const searchEquipment = async (req, res) => {
  try {
    const { search, location, availability } = req.query;

    console.log('🔍 Equipment Search Params:', {
      search: search || 'none',
      location: location || 'none',
      availability: availability || 'all'
    });

    let query = `
      SELECT 
        e.id,
        e.user_id,
        e.equipment_name as equipmentName,
        e.equipment_type as equipmentType,
        e.availability,
        e.location,
        e.contact_person as contactPerson,
        e.contact_number as contactNumber,
        e.contact_email as contactEmail,
        e.description,
        e.equipment_images as equipmentImages,
        e.equipment_documents as equipmentDocuments,
        e.created_at
      FROM equipment e
      WHERE e.is_active = TRUE
    `;

    const params = [];

    // Search filter (equipment name or type)
    if (search && search.trim()) {
      query += ` AND (e.equipment_name LIKE ? OR e.equipment_type LIKE ?)`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm);
    }

    // Location filter
    if (location && location.trim()) {
      query += ` AND e.location LIKE ?`;
      params.push(`%${location.trim()}%`);
    }

    // Availability filter
    if (availability && availability !== 'all') {
      query += ` AND e.availability = ?`;
      params.push(availability);
      console.log('✅ Availability filter applied:', availability);
    }

    query += ` ORDER BY e.created_at DESC`;

    console.log('📊 SQL Query:', query);
    console.log('📊 SQL Params:', params);

    const [results] = await db.query(query, params);

    console.log(`✅ Found ${results.length} equipment items`);

    // Parse equipment_images and equipment_documents JSON
    const equipment = results.map(item => {
      let parsedImages = [];
      let parsedDocuments = [];
      
      try {
        if (Buffer.isBuffer(item.equipmentImages)) {
          parsedImages = JSON.parse(item.equipmentImages.toString('utf8'));
        } else if (typeof item.equipmentImages === 'string' && item.equipmentImages.trim()) {
          parsedImages = JSON.parse(item.equipmentImages);
        } else if (Array.isArray(item.equipmentImages)) {
          parsedImages = item.equipmentImages;
        }
      } catch (e) {
        console.error('Error parsing equipment images:', e);
        parsedImages = [];
      }

      try {
        if (Buffer.isBuffer(item.equipmentDocuments)) {
          parsedDocuments = JSON.parse(item.equipmentDocuments.toString('utf8'));
        } else if (typeof item.equipmentDocuments === 'string' && item.equipmentDocuments.trim()) {
          parsedDocuments = JSON.parse(item.equipmentDocuments);
        } else if (Array.isArray(item.equipmentDocuments)) {
          parsedDocuments = item.equipmentDocuments;
        }
      } catch (e) {
        console.error('Error parsing equipment documents:', e);
        parsedDocuments = [];
      }

      return {
        ...item,
        equipmentImages: parsedImages,
        equipmentDocuments: parsedDocuments
      };
    });

    res.status(200).json({
      success: true,
      data: equipment,
      count: equipment.length
    });

  } catch (error) {
    console.error('❌ Equipment search error:', error);
    res.status(500).json({
      success: false,
      msg: 'Error searching equipment',
      error: error.message
    });
  }
};

/**
 * Get all unique locations from equipment
 */
const getLocations = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT location
      FROM equipment
      WHERE is_active = TRUE AND location IS NOT NULL AND location != ''
      ORDER BY location ASC
    `;

    const [results] = await db.query(query);
    const locations = results.map(row => row.location);

    res.status(200).json({
      success: true,
      msg: 'Locations retrieved successfully',
      data: locations,
      count: locations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get locations error:', error);
    res.status(500).json({
      success: false,
      msg: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get equipment statistics
 */
const getEquipmentStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN availability = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN availability = 'on-hire' THEN 1 ELSE 0 END) as onHire,
        COUNT(DISTINCT location) as locations,
        COUNT(DISTINCT equipment_type) as types
      FROM equipment
      WHERE is_active = TRUE
    `;

    const [results] = await db.query(query);
    const stats = results[0];

    res.status(200).json({
      success: true,
      msg: 'Equipment statistics retrieved successfully',
      data: {
        total: stats.total || 0,
        available: stats.available || 0,
        onHire: stats.onHire || 0,
        locations: stats.locations || 0,
        types: stats.types || 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get equipment stats error:', error);
    res.status(500).json({
      success: false,
      msg: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get equipment by ID
 */
const getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        id,
        user_id,
        equipment_name as equipmentName,
        equipment_type as equipmentType,
        location,
        contact_person as contactPerson,
        contact_number as contactNumber,
        contact_email as contactEmail,
        availability,
        description,
        equipment_images as equipmentImages,
        equipment_documents as equipmentDocuments,
        created_at as createdAt,
        updated_at as updatedAt
      FROM equipment
      WHERE id = ? AND is_active = TRUE
    `;

    const [results] = await db.query(query, [id]);

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        msg: 'Equipment not found',
        timestamp: new Date().toISOString()
      });
    }

    const equipment = results[0];
    
    // Parse images
    let images = [];
    try {
      if (equipment.equipmentImages) {
        if (Buffer.isBuffer(equipment.equipmentImages)) {
          images = JSON.parse(equipment.equipmentImages.toString('utf8'));
        } else if (typeof equipment.equipmentImages === 'string') {
          images = JSON.parse(equipment.equipmentImages);
        } else if (Array.isArray(equipment.equipmentImages)) {
          images = equipment.equipmentImages;
        }
      }
    } catch (parseError) {
      console.error('Error parsing images:', parseError);
    }

    // Parse documents
    let documents = [];
    try {
      if (equipment.equipmentDocuments) {
        if (Buffer.isBuffer(equipment.equipmentDocuments)) {
          documents = JSON.parse(equipment.equipmentDocuments.toString('utf8'));
        } else if (typeof equipment.equipmentDocuments === 'string') {
          documents = JSON.parse(equipment.equipmentDocuments);
        } else if (Array.isArray(equipment.equipmentDocuments)) {
          documents = equipment.equipmentDocuments;
        }
      }
    } catch (parseError) {
      console.error('Error parsing documents:', parseError);
    }

    equipment.equipmentImages = images;
    equipment.equipmentDocuments = documents;

    res.status(200).json({
      success: true,
      msg: 'Equipment retrieved successfully',
      data: equipment,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get equipment by ID error:', error);
    res.status(500).json({
      success: false,
      msg: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ==========================================
// GET OWNER PROFILE (Public Access)
// ==========================================
const getOwnerProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        eop.name,
        eop.email,
        eop.mobile_number,
        eop.whatsapp_number,
        eop.location,
        eop.company_name,
        eop.profile_photo,
        eop.equipment_count
      FROM equipment_owner_profiles eop
      WHERE eop.user_id = ?
    `;
    
    const [results] = await db.query(query, [userId]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        msg: 'Owner profile not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: results[0]
    });
  } catch (error) {
    console.error('Get owner profile error:', error);
    res.status(500).json({
      success: false,
      msg: 'Error fetching owner profile',
      error: error.message
    });
  }
};

module.exports = {
  searchEquipment,
  getLocations,
  getEquipmentStats,
  getEquipmentById,
  getOwnerProfile
};