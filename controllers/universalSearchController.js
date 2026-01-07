// controllers/universalSearchController.js - COMPREHENSIVE GLOBAL SEARCH
const db = require('../config/db');

/**
 * Universal Search - Search across ALL database fields
 * Searches: Name, Email, Phone, National ID, Location, Job Title, Equipment Name, Description, Jobs, etc.
 */
const universalSearch = async (req, res) => {
  const startTime = Date.now();
  const { query } = req.query;

  console.log('🔍 Universal Search Query:', query);

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  try {
    const searchTerm = query.trim();
    const searchPattern = `%${searchTerm}%`;

    // ==========================================
    // SEARCH MANPOWER PROFILES - ALL FIELDS
    // ==========================================
    const manpowerQuery = `
      SELECT 
        mp.id,
        mp.user_id,
        mp.first_name,
        mp.last_name,
        mp.email,
        mp.mobile_number,
        mp.whatsapp_number,
        mp.national_id,
        mp.location,
        mp.job_title,
        mp.availability_status,
        mp.available_from,
        mp.rate,
        mp.profile_description,
        mp.profile_photo,
        mp.cv_path,
        mp.certificates,
        mp.created_at,
        u.user_type,
        cp.name as consultant_name,
        cp.company_name as consultant_company
      FROM manpower_profiles mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN consultant_profiles cp ON mp.user_id = cp.user_id
      WHERE 
        mp.first_name LIKE ? OR
        mp.last_name LIKE ? OR
        CONCAT(mp.first_name, ' ', mp.last_name) LIKE ? OR
        mp.email LIKE ? OR
        mp.mobile_number LIKE ? OR
        mp.whatsapp_number LIKE ? OR
        mp.national_id LIKE ? OR
        mp.location LIKE ? OR
        mp.job_title LIKE ? OR
        mp.profile_description LIKE ? OR
        mp.rate LIKE ?
      ORDER BY mp.created_at DESC
      LIMIT 100
    `;

    const manpowerParams = Array(11).fill(searchPattern);
    const [manpowerResults] = await db.query(manpowerQuery, manpowerParams);

    console.log(`✅ Found ${manpowerResults.length} manpower results`);

    // Parse manpower certificates
    const parsedManpower = manpowerResults.map(profile => {
      let certificates = [];
      try {
        if (profile.certificates) {
          if (Buffer.isBuffer(profile.certificates)) {
            certificates = JSON.parse(profile.certificates.toString('utf8'));
          } else if (typeof profile.certificates === 'string') {
            certificates = JSON.parse(profile.certificates);
          } else if (Array.isArray(profile.certificates)) {
            certificates = profile.certificates;
          }
        }
      } catch (e) {
        console.error('Error parsing certificates:', e);
        certificates = [];
      }

      const isConsultantManaged = profile.user_type === 'consultant';
      
      return {
        ...profile,
        certificates,
        isConsultantManaged,
        managedBy: isConsultantManaged ? {
          name: profile.consultant_name,
          company: profile.consultant_company
        } : null
      };
    });

    // ==========================================
    // SEARCH EQUIPMENT - ALL FIELDS
    // ==========================================
    const equipmentQuery = `
      SELECT 
        e.id,
        e.user_id,
        e.equipment_name,
        e.equipment_type,
        e.availability,
        e.location,
        e.contact_person,
        e.contact_number,
        e.contact_email,
        e.description,
        e.equipment_images,
        e.equipment_documents,
        e.created_at,
        eop.name as owner_name,
        eop.email as owner_email,
        eop.mobile_number as owner_mobile,
        eop.whatsapp_number as owner_whatsapp,
        eop.company_name as owner_company
      FROM equipment e
      LEFT JOIN equipment_owner_profiles eop ON e.user_id = eop.user_id
      WHERE 
        e.is_active = TRUE AND (
          e.equipment_name LIKE ? OR
          e.equipment_type LIKE ? OR
          e.location LIKE ? OR
          e.contact_person LIKE ? OR
          e.contact_number LIKE ? OR
          e.contact_email LIKE ? OR
          e.description LIKE ? OR
          eop.name LIKE ? OR
          eop.email LIKE ? OR
          eop.mobile_number LIKE ? OR
          eop.company_name LIKE ?
        )
      ORDER BY e.created_at DESC
      LIMIT 100
    `;

    const equipmentParams = Array(11).fill(searchPattern);
    const [equipmentResults] = await db.query(equipmentQuery, equipmentParams);

    console.log(`✅ Found ${equipmentResults.length} equipment results`);

    // Parse equipment images and documents
    const parsedEquipment = equipmentResults.map(item => {
      let parsedImages = [];
      let parsedDocuments = [];
      
      try {
        if (Buffer.isBuffer(item.equipment_images)) {
          parsedImages = JSON.parse(item.equipment_images.toString('utf8'));
        } else if (typeof item.equipment_images === 'string' && item.equipment_images.trim()) {
          parsedImages = JSON.parse(item.equipment_images);
        } else if (Array.isArray(item.equipment_images)) {
          parsedImages = item.equipment_images;
        }
      } catch (e) {
        console.error('Error parsing equipment images:', e);
        parsedImages = [];
      }

      try {
        if (Buffer.isBuffer(item.equipment_documents)) {
          parsedDocuments = JSON.parse(item.equipment_documents.toString('utf8'));
        } else if (typeof item.equipment_documents === 'string' && item.equipment_documents.trim()) {
          parsedDocuments = JSON.parse(item.equipment_documents);
        } else if (Array.isArray(item.equipment_documents)) {
          parsedDocuments = item.equipment_documents;
        }
      } catch (e) {
        console.error('Error parsing equipment documents:', e);
        parsedDocuments = [];
      }

      return {
        id: item.id,
        user_id: item.user_id,
        equipmentName: item.equipment_name,
        equipmentType: item.equipment_type,
        availability: item.availability,
        location: item.location,
        contactPerson: item.contact_person,
        contactNumber: item.contact_number,
        contactEmail: item.contact_email,
        description: item.description,
        equipmentImages: parsedImages,
        equipmentDocuments: parsedDocuments,
        created_at: item.created_at,
        owner: {
          name: item.owner_name,
          email: item.owner_email,
          mobile: item.owner_mobile,
          whatsapp: item.owner_whatsapp,
          company: item.owner_company
        }
      };
    });

    // ==========================================
    // SEARCH JOBS - ALL FIELDS
    // ==========================================
    const jobsQuery = `
      SELECT 
        j.id,
        j.user_id,
        j.job_title,
        j.company_name,
        j.location,
        j.job_type,
        j.experience_level,
        j.salary_range,
        j.description,
        j.requirements,
        j.industry,
        j.status,
        j.posted_date,
        j.expiry_date,
        j.views_count,
        jpp.company_logo,
        jpp.company_size,
        jpp.email as company_email,
        jpp.mobile_number as company_mobile
      FROM jobs j
      LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
      WHERE 
        j.status = 'open' AND
        (j.expiry_date IS NULL OR j.expiry_date >= CURDATE()) AND
        (
          j.job_title LIKE ? OR
          j.company_name LIKE ? OR
          j.location LIKE ? OR
          j.description LIKE ? OR
          j.requirements LIKE ? OR
          j.industry LIKE ? OR
          j.job_type LIKE ? OR
          j.experience_level LIKE ? OR
          j.salary_range LIKE ? OR
          jpp.email LIKE ? OR
          jpp.mobile_number LIKE ? OR
          j.id = ?
        )
      ORDER BY j.posted_date DESC
      LIMIT 100
    `;

    const numericSearch = parseInt(searchTerm) || 0;
    const jobsParams = [
      searchPattern, searchPattern, searchPattern, searchPattern,
      searchPattern, searchPattern, searchPattern, searchPattern,
      searchPattern, searchPattern, searchPattern, numericSearch
    ];
    
    const [jobsResults] = await db.query(jobsQuery, jobsParams);

    console.log(`✅ Found ${jobsResults.length} jobs results`);

    const responseTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      query: searchTerm,
      manpower: parsedManpower,
      equipment: parsedEquipment,
      jobs: jobsResults,
      totalResults: parsedManpower.length + parsedEquipment.length + jobsResults.length,
      counts: {
        manpower: parsedManpower.length,
        equipment: parsedEquipment.length,
        jobs: jobsResults.length
      },
      processingTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Universal search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  universalSearch
};