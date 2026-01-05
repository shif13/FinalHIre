// controllers/manpowerSearchController.js - FIXED VERSION
const db = require('../config/db');
const { buildLocationQuery } = require('./locationSearchHelper');
const NodeCache = require('node-cache');

// Create cache instance - categories refresh every 2 hours
const categoryCache = new NodeCache({ 
  stdTTL: 7200, // 2 hours in seconds
  checkperiod: 600 // Check for expired keys every 10 minutes
});

// Updated search functions to include new tracking fields

const searchManpower = async (req, res) => {
  const startTime = Date.now();
  const { jobTitle, location, availabilityStatus } = req.body;

  try {
    let query = `
      SELECT 
        mp.id,
        mp.user_id,
        mp.profile_type,
        mp.first_name,
        mp.last_name,
        mp.email,
        mp.mobile_number,
        mp.whatsapp_number,
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
        mp.last_modified,
        u.user_type,
        cp.name as consultant_name,
        cp.company_name as consultant_company
      FROM manpower_profiles mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN consultant_profiles cp ON mp.user_id = cp.user_id
      WHERE 1=1
    `;

    const params = [];

    // Job Title Filter
    if (jobTitle && jobTitle.trim()) {
      query += ` AND mp.job_title LIKE ?`;
      params.push(`%${jobTitle.trim()}%`);
    }

    // Location Filter
    if (location && location.trim()) {
      query += ` AND mp.location LIKE ?`;
      params.push(`%${location.trim()}%`);
    }

    // Availability Filter
    if (availabilityStatus) {
      query += ` AND mp.availability_status = ?`;
      params.push(availabilityStatus);
    }

    query += ` ORDER BY mp.created_at DESC LIMIT 100`;

    const [manpower] = await db.query(query, params);

    const parsedManpower = manpower.map(profile => {
      // ✅ FIX: Calculate relevanceScore BEFORE using it
      let relevanceScore = 0;
      
      // Add points for exact job title match
      if (jobTitle && profile.job_title) {
        const searchLower = jobTitle.toLowerCase();
        const titleLower = profile.job_title.toLowerCase();
        if (titleLower === searchLower) {
          relevanceScore += 10;
        } else if (titleLower.includes(searchLower)) {
          relevanceScore += 5;
        }
      }

      // Add points for location match
      if (location && profile.location) {
        const searchLower = location.toLowerCase();
        const locationLower = profile.location.toLowerCase();
        if (locationLower === searchLower) {
          relevanceScore += 10;
        } else if (locationLower.includes(searchLower)) {
          relevanceScore += 5;
        }
      }

      // Add points for availability
      if (profile.availability_status === 'available') {
        relevanceScore += 3;
      }

      // Add points for having CV
      if (profile.cv_path) {
        relevanceScore += 2;
      }

      // Add points for having certificates
      if (profile.certificates) {
        try {
          let certs = [];
          if (Buffer.isBuffer(profile.certificates)) {
            certs = JSON.parse(profile.certificates.toString('utf8'));
          } else if (typeof profile.certificates === 'string') {
            certs = JSON.parse(profile.certificates);
          } else if (Array.isArray(profile.certificates)) {
            certs = profile.certificates;
          }
          if (certs.length > 0) {
            relevanceScore += certs.length;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }

      // Parse certificates
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
        certificates = [];
      }

      const isConsultantManaged = profile.profile_type === 'consultant_managed';
      
      return {
        ...profile,
        certificates,
        relevanceScore, // ✅ Now this is defined
        isConsultantManaged,
        profileType: profile.profile_type,
        lastModified: profile.last_modified,
        managedBy: isConsultantManaged ? {
          name: profile.consultant_name,
          company: profile.consultant_company
        } : null
      };
    });

    // Sort by relevance score (highest first)
    parsedManpower.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const executionTime = Date.now() - startTime;

    res.json({
      success: true,
      manpower: parsedManpower,
      count: parsedManpower.length,
      executionTime: `${executionTime}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Manpower search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error searching manpower profiles',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

const getManpowerDetails = async (req, res) => {
  const { manpowerId } = req.params;

  if (!manpowerId) {
    return res.status(400).json({ success: false, message: 'Manpower ID is required' });
  }

  try {
    const query = `
      SELECT 
        mp.*,
        u.is_active,
        u.user_type,
        modifier.first_name as modifier_first_name,
        modifier.last_name as modifier_last_name,
        modifier.user_type as modifier_type,
        cp.name as consultant_name,
        cp.company_name as consultant_company,
        cp.email as consultant_email,
        cp.mobile_number as consultant_mobile,
        cp.whatsapp_number as consultant_whatsapp
      FROM manpower_profiles mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN users modifier ON mp.modified_by = modifier.id
      LEFT JOIN consultant_profiles cp ON mp.user_id = cp.user_id
      WHERE mp.id = ?
    `;

    const [profiles] = await db.query(query, [manpowerId]);

    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Manpower profile not found' });
    }

    const profile = profiles[0];
    
    let parsedCertificates = [];
    try {
      if (profile.certificates) {
        if (Buffer.isBuffer(profile.certificates)) {
          parsedCertificates = JSON.parse(profile.certificates.toString('utf8'));
        } else if (typeof profile.certificates === 'string') {
          parsedCertificates = JSON.parse(profile.certificates);
        } else if (Array.isArray(profile.certificates)) {
          parsedCertificates = profile.certificates;
        }
      }
    } catch (error) {
      parsedCertificates = [];
    }

    const isConsultantManaged = profile.profile_type === 'consultant_managed';

    const parsedProfile = {
      ...profile,
      certificates: parsedCertificates,
      isConsultantManaged,
      profileType: profile.profile_type,
      lastModified: profile.last_modified,
      modifiedBy: profile.modified_by ? {
        firstName: profile.modifier_first_name,
        lastName: profile.modifier_last_name,
        userType: profile.modifier_type
      } : null,
      managedBy: isConsultantManaged ? {
        name: profile.consultant_name,
        company: profile.consultant_company,
        email: profile.consultant_email,
        mobile: profile.consultant_mobile,
        whatsapp: profile.consultant_whatsapp
      } : null
    };

    res.json({ success: true, profile: parsedProfile });

  } catch (error) {
    console.error('Get manpower details error:', error);
    res.status(500).json({ success: false, message: 'Error fetching manpower details', error: error.message });
  }
};

// ==========================================
// OPTIMIZED CATEGORIES - WITH CACHING
// ==========================================
const getProfessionalCategories = async (req, res) => {
  try {
    const cacheKey = 'professional_categories';
    
    // Try to get from cache first
    const cachedData = categoryCache.get(cacheKey);
    if (cachedData) {
      console.log('✅ Returning categories from cache');
      return res.json({
        ...cachedData,
        cached: true,
        cacheAge: Math.floor((Date.now() - cachedData.cachedAt) / 1000) + 's'
      });
    }

    console.log('🔄 Cache miss - fetching categories from database...');

    // Optimized query - only get top 20 categories
    const query = `
      SELECT 
        TRIM(job_title) as job_title,
        COUNT(*) as count
      FROM manpower_profiles
      WHERE job_title IS NOT NULL 
        AND job_title != '' 
        AND TRIM(job_title) != ''
      GROUP BY TRIM(job_title)
      ORDER BY count DESC
      LIMIT 20
    `;

    const [results] = await db.query(query);

    console.log(`✅ Found ${results.length} top job categories`);

    // Format the categories
    const categories = results.map(row => ({
      name: row.job_title,
      count: row.count
    }));

    // Calculate total professionals (from these top categories)
    const totalProfessionals = categories.reduce((sum, cat) => sum + cat.count, 0);

    const response = {
      success: true,
      categories: categories,
      totalCategories: categories.length,
      totalProfessionals: totalProfessionals,
      timestamp: new Date().toISOString(),
      cachedAt: Date.now()
    };

    // Store in cache
    categoryCache.set(cacheKey, response);
    console.log('💾 Categories cached for 2 hours');

    res.json({
      ...response,
      cached: false
    });

  } catch (error) {
    console.error('❌ Categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching professional categories',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function to manually clear cache (useful for admin actions)
const clearCategoryCache = () => {
  categoryCache.del('professional_categories');
  console.log('🗑️ Category cache cleared');
};

// Optional: Add endpoint to clear cache manually
const refreshCategories = async (req, res) => {
  try {
    clearCategoryCache();
    res.json({
      success: true,
      message: 'Category cache cleared. Next request will fetch fresh data.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing cache',
      error: error.message
    });
  }
};

const getSearchStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT id) as totalManpower,
        COUNT(DISTINCT CASE WHEN cv_path IS NOT NULL THEN id END) as manpowerWithCV,
        COUNT(DISTINCT CASE WHEN availability_status = 'available' THEN id END) as availableManpower,
        COUNT(DISTINCT job_title) as uniqueJobTitles
      FROM manpower_profiles
    `;

    const [stats] = await db.query(statsQuery);
    res.json({ success: true, statistics: stats[0] });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching search statistics', error: error.message });
  }
};

const getFeaturedManpower = async (req, res) => {
  try {
    const query = `
      SELECT id, user_id, first_name, last_name, email, mobile_number, location, 
             job_title, availability_status, available_from, rate, profile_description, 
             profile_photo, cv_path, created_at
      FROM manpower_profiles
      WHERE job_title IS NOT NULL AND job_title != '' AND availability_status = 'available'
      ORDER BY created_at DESC LIMIT 6
    `;

    const [manpower] = await db.query(query);
    res.json({ success: true, manpower: manpower || [], count: manpower.length });

  } catch (error) {
    console.error('Featured manpower error:', error);
    res.status(500).json({ success: false, message: 'Error fetching featured manpower', error: error.message });
  }
};

module.exports = {
  searchManpower,
  getManpowerDetails,
  getSearchStats,
  getProfessionalCategories,
  getFeaturedManpower,
  refreshCategories,
  clearCategoryCache
};