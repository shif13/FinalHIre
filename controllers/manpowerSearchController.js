// controllers/manpowerSearchController.js - FIXED VERSION
const db = require('../config/db');
const { buildLocationQuery } = require('./locationSearchHelper');
const NodeCache = require('node-cache');

// Create cache instance - categories refresh every 2 hours
const categoryCache = new NodeCache({ 
  stdTTL: 7200, // 2 hours in seconds
  checkperiod: 600 // Check for expired keys every 10 minutes
});

const searchManpower = async (req, res) => {
  const startTime = Date.now();
  const { jobTitle, location, availabilityStatus } = req.body;

  try {
    let query = `
      SELECT 
        mp.id,
        mp.user_id,
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
        u.user_type,
        cp.name as consultant_name,
        cp.company_name as consultant_company
      FROM manpower_profiles mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN consultant_profiles cp ON mp.user_id = cp.user_id
      WHERE 1=1
    `;

    const params = [];

    // Job title search
    if (jobTitle && jobTitle.trim()) {
      const searchTerm = jobTitle.toLowerCase().trim();
      query += ` AND (
        LOWER(mp.job_title) LIKE ? OR 
        LOWER(mp.profile_description) LIKE ?
      )`;
      const searchPattern = `%${searchTerm}%`;
      params.push(searchPattern, searchPattern);
    }

    // Location filter
    if (location && location.trim()) {
      const locationQuery = buildLocationQuery(location.trim());
      if (locationQuery.condition) {
        const fixedCondition = locationQuery.condition.replace(/LOWER\(location\)/g, 'LOWER(mp.location)');
        query += ` AND ${fixedCondition}`;
        params.push(...locationQuery.params);
      }
    }

    // Availability filter
    if (availabilityStatus && availabilityStatus.trim()) {
      const status = availabilityStatus.trim().toLowerCase();
      if (status === 'available' || status === 'busy') {
        query += ` AND mp.availability_status = ?`;
        params.push(status);
      }
    }

    query += ` ORDER BY mp.created_at DESC LIMIT 100`;

    const [manpower] = await db.query(query, params);

    const parsedManpower = manpower.map(profile => {
      let relevanceScore = 0;
      if (jobTitle && jobTitle.trim()) {
        const searchTerm = jobTitle.toLowerCase();
        const title = (profile.job_title || '').toLowerCase();
        const desc = (profile.profile_description || '').toLowerCase();

        if (title === searchTerm) relevanceScore += 10;
        else if (title.includes(searchTerm)) relevanceScore += 5;
        if (desc.includes(searchTerm)) relevanceScore += 3;
        if (location) {
          const profileLocation = (profile.location || '').toLowerCase();
          if (profileLocation.includes(location.toLowerCase())) relevanceScore += 4;
        }
        if (profile.availability_status === 'available') relevanceScore += 2;
        if (profile.cv_path) relevanceScore += 1;
      }
      
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

      const isConsultantManaged = profile.user_type === 'consultant';
      
      return {
        ...profile,
        certificates,
        relevanceScore,
        isConsultantManaged,
        managedBy: isConsultantManaged ? {
          name: profile.consultant_name,
          company: profile.consultant_company
        } : null
      };
    });

    const sortedManpower = jobTitle && jobTitle.trim() 
      ? parsedManpower.sort((a, b) => b.relevanceScore - a.relevanceScore)
      : parsedManpower;

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      manpower: sortedManpower,
      total: sortedManpower.length,
      searchCriteria: { jobTitle, location, availabilityStatus },
      processingTime: `${responseTime}ms`,
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

// ✅✅✅ FIXED: Removed u.email_verified from SELECT
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
        cp.name as consultant_name,
        cp.company_name as consultant_company,
        cp.email as consultant_email,
        cp.mobile_number as consultant_mobile,
        cp.whatsapp_number as consultant_whatsapp
      FROM manpower_profiles mp
      LEFT JOIN users u ON mp.user_id = u.id
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

    const isConsultantManaged = profile.user_type === 'consultant';

    const parsedProfile = {
      ...profile,
      certificates: parsedCertificates,
      isConsultantManaged,
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
  console.log('🗑️  Category cache cleared');
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