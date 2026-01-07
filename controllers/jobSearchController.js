// controllers/jobSearchController.js
const db = require('../config/db');
const { buildLocationQuery } = require('./locationSearchHelper');

// ==========================================
// JOB TITLE SYNONYMS & KEYWORDS
// ==========================================
const JOB_SYNONYMS = {
  // Software/Tech roles
  'developer': ['engineer', 'programmer', 'coder', 'sde', 'software', 'dev', 'frontend', 'backend', 'fullstack', 'full stack', 'full-stack'],
  'engineer': ['developer', 'sde', 'software', 'programmer', 'architect', 'dev'],
  'sde': ['software', 'developer', 'engineer', 'programmer'],
  'software': ['sde', 'developer', 'engineer', 'programmer', 'tech'],
  'frontend': ['front-end', 'front end', 'ui', 'react', 'angular', 'vue', 'web developer'],
  'backend': ['back-end', 'back end', 'server', 'api', 'node', 'java', 'python'],
  'fullstack': ['full-stack', 'full stack', 'full stack developer', 'fullstack developer'],
  
  // Management roles
  'manager': ['management', 'lead', 'head', 'director', 'supervisor', 'team lead'],
  'lead': ['manager', 'team lead', 'technical lead', 'tech lead'],
  'director': ['head', 'manager', 'vp', 'vice president'],
  
  // Design roles
  'designer': ['design', 'ui', 'ux', 'graphic', 'visual', 'product designer'],
  'ux': ['ui', 'designer', 'user experience', 'product designer'],
  'ui': ['ux', 'designer', 'user interface', 'frontend'],
  
  // Data roles
  'data': ['analyst', 'scientist', 'engineer', 'analytics', 'bi', 'database'],
  'analyst': ['data', 'business analyst', 'analytics', 'bi'],
  'scientist': ['data scientist', 'ml', 'machine learning', 'ai'],
  
  // Marketing/Sales
  'marketing': ['digital marketing', 'growth', 'seo', 'social media', 'content'],
  'sales': ['business development', 'account manager', 'sales executive'],
  
  // HR/Admin
  'hr': ['human resources', 'recruiter', 'talent', 'people'],
  'recruiter': ['hr', 'talent acquisition', 'hiring'],
  
  // Construction/Engineering
  'civil': ['civil engineer', 'construction', 'site', 'structural'],
  'mechanical': ['mechanical engineer', 'production', 'manufacturing'],
  'electrical': ['electrical engineer', 'electronics', 'eee'],
  
  // Common terms
  'intern': ['internship', 'trainee', 'fresher'],
  'fresher': ['entry level', 'junior', 'trainee', 'intern'],
  'senior': ['sr', 'lead', 'principal', 'expert'],
  'junior': ['jr', 'entry level', 'fresher'],
};

// Function to get all related keywords for a search term
const getRelatedKeywords = (searchTerm) => {
  const term = searchTerm.toLowerCase().trim();
  const related = new Set([term]); // Include original term
  
  // Check if term exists in synonyms
  if (JOB_SYNONYMS[term]) {
    JOB_SYNONYMS[term].forEach(synonym => related.add(synonym));
  }
  
  // Check if term is a synonym of any key
  Object.entries(JOB_SYNONYMS).forEach(([key, synonyms]) => {
    if (synonyms.includes(term)) {
      related.add(key);
      synonyms.forEach(s => related.add(s));
    }
  });
  
  return Array.from(related);
};

// ==========================================
// SEARCH JOBS (Public Access) - WITH SMART SEARCH
// ==========================================
const searchJobs = async (req, res) => {
  try {
    const { 
      query,          // Job title search
      location, 
      industry, 
      jobType, 
      experienceLevel,
      salaryMin,
      salaryMax
    } = req.query;

    console.log('🔍 Job Search Params:', req.query);

    let sqlQuery = `
      SELECT 
        j.*,
        jpp.company_logo,
        jpp.company_size
      FROM jobs j
      LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
      WHERE j.status = 'open'
    `;

    const params = [];

    // ✅ SMART SEARCH: Job title search with synonyms
    if (query && query.trim()) {
      const searchTerms = query.trim().toLowerCase().split(/\s+/); // Split by spaces
      const allKeywords = [];
      
      // Get synonyms for each search term
      searchTerms.forEach(term => {
        const related = getRelatedKeywords(term);
        allKeywords.push(...related);
      });
      
      // Remove duplicates
      const uniqueKeywords = [...new Set(allKeywords)];
      
      console.log('🔎 Original search:', query);
      console.log('🔎 Expanded keywords:', uniqueKeywords);
      
      // Build search condition for each keyword (search in job_title, description, company_name)
      const searchConditions = uniqueKeywords.map(() => 
        `(LOWER(j.job_title) LIKE ? OR LOWER(j.description) LIKE ? OR LOWER(j.company_name) LIKE ?)`
      ).join(' OR ');
      
      sqlQuery += ` AND (${searchConditions})`;
      
      // Add wildcard search for each keyword
      uniqueKeywords.forEach(keyword => {
        const searchPattern = `%${keyword}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      });
    }

    // Location filter
    if (location && location.trim()) {
      sqlQuery += ` AND j.location LIKE ?`;
      params.push(`%${location.trim()}%`);
    }

    // Industry filter
    if (industry && industry.trim() && industry !== 'all') {
      sqlQuery += ` AND j.industry = ?`;
      params.push(industry.trim());
    }

    // Job type filter
    if (jobType && jobType !== 'all') {
      sqlQuery += ` AND j.job_type = ?`;
      params.push(jobType);
    }

    // Experience level filter
    if (experienceLevel && experienceLevel !== 'all') {
      sqlQuery += ` AND j.experience_level = ?`;
      params.push(experienceLevel);
    }

    // Salary range filter (basic implementation)
    if (salaryMin || salaryMax) {
      // Note: This is a simple text-based filter
      // For production, consider storing salary as numbers
      if (salaryMin) {
        sqlQuery += ` AND j.salary_range IS NOT NULL`;
      }
    }

    // Auto-close expired jobs
    sqlQuery += ` AND (j.expiry_date IS NULL OR j.expiry_date >= CURDATE())`;

    sqlQuery += ` ORDER BY j.posted_date DESC LIMIT 100`;

    const [jobs] = await db.query(sqlQuery, params);

    console.log(`✅ Found ${jobs.length} jobs`);

    res.status(200).json({
      success: true,
      jobs: jobs || [],
      count: jobs.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Job search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching jobs',
      error: error.message
    });
  }
};

// ==========================================
// GET JOB DETAILS (Public Access)
// ==========================================
const getJobDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const [jobs] = await db.query(
      `SELECT 
        j.*,
        jpp.company_name,
        jpp.company_logo,
        jpp.company_size,
        jpp.location as company_location,
        jpp.email as company_email,
        jpp.mobile_number as company_mobile
       FROM jobs j
       LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
       WHERE j.id = ?`,
      [id]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const job = jobs[0];

    // Increment views count
    await db.query(
      'UPDATE jobs SET views_count = views_count + 1 WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      job: job
    });

  } catch (error) {
    console.error('Get job details error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job details',
      error: error.message
    });
  }
};

// ==========================================
// GET JOB RECOMMENDATIONS (For Manpower Users)
// ==========================================
const getJobRecommendations = async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get user's manpower profile
    const [profiles] = await db.query(
      'SELECT job_title, location FROM manpower_profiles WHERE user_id = ?',
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Manpower profile not found'
      });
    }

    const { job_title, location } = profiles[0];

    // Find matching jobs based on job_title and location
    const [jobs] = await db.query(
      `SELECT 
        j.*,
        jpp.company_logo,
        jpp.company_size,
        CASE 
          WHEN j.job_title LIKE ? AND j.location LIKE ? THEN 90
          WHEN j.job_title LIKE ? THEN 70
          WHEN j.location LIKE ? THEN 50
          ELSE 30
        END as match_score
       FROM jobs j
       LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
       WHERE j.status = 'open'
       AND (j.expiry_date IS NULL OR j.expiry_date >= CURDATE())
       AND (j.job_title LIKE ? OR j.location LIKE ?)
       ORDER BY match_score DESC, j.posted_date DESC
       LIMIT 10`,
      [
        `%${job_title}%`,
        `%${location}%`,
        `%${job_title}%`,
        `%${location}%`,
        `%${job_title}%`,
        `%${location}%`
      ]
    );

    console.log(`✅ Found ${jobs.length} recommended jobs for user ${userId}`);

    res.status(200).json({
      success: true,
      jobs: jobs || [],
      count: jobs.length,
      profileData: {
        job_title,
        location
      }
    });

  } catch (error) {
    console.error('Get job recommendations error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recommendations',
      error: error.message
    });
  }
};

// ==========================================
// GET FEATURED JOBS (Public Access)
// ==========================================
const getFeaturedJobs = async (req, res) => {
  try {
    const [jobs] = await db.query(
      `SELECT 
        j.*,
        jpp.company_logo,
        jpp.company_size
       FROM jobs j
       LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
       WHERE j.status = 'open'
       AND (j.expiry_date IS NULL OR j.expiry_date >= CURDATE())
       ORDER BY j.posted_date DESC
       LIMIT 6`,
      []
    );

    res.status(200).json({
      success: true,
      jobs: jobs || [],
      count: jobs.length
    });

  } catch (error) {
    console.error('Get featured jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching featured jobs',
      error: error.message
    });
  }
};

// ==========================================
// GET JOB CATEGORIES (Public Access)
// ==========================================
const getJobCategories = async (req, res) => {
  try {
    const [categories] = await db.query(
      `SELECT 
        industry,
        COUNT(*) as count
       FROM jobs
       WHERE status = 'open'
       AND industry IS NOT NULL
       AND (expiry_date IS NULL OR expiry_date >= CURDATE())
       GROUP BY industry
       ORDER BY count DESC`,
      []
    );

    // Get total open jobs
    const [totals] = await db.query(
      `SELECT COUNT(*) as total
       FROM jobs
       WHERE status = 'open'
       AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
      []
    );

    res.status(200).json({
      success: true,
      categories: categories || [],
      totalJobs: totals[0]?.total || 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Get job categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
};

// ==========================================
// SAVE JOB (Manpower Users Only)
// ==========================================
const saveJob = async (req, res) => {
  const userId = req.user.userId;
  const { jobId } = req.params;

  try {
    // Check if job exists
    const [jobs] = await db.query(
      'SELECT id FROM jobs WHERE id = ?',
      [jobId]
    );

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if already saved
    const [existing] = await db.query(
      'SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?',
      [userId, jobId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Job already saved'
      });
    }

    // Save job
    await db.query(
      'INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)',
      [userId, jobId]
    );

    console.log(`✅ Job ${jobId} saved by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Job saved successfully'
    });

  } catch (error) {
    console.error('Save job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving job',
      error: error.message
    });
  }
};

// ==========================================
// UNSAVE JOB (Manpower Users Only)
// ==========================================
const unsaveJob = async (req, res) => {
  const userId = req.user.userId;
  const { jobId } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?',
      [userId, jobId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Saved job not found'
      });
    }

    console.log(`✅ Job ${jobId} unsaved by user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Job removed from saved list'
    });

  } catch (error) {
    console.error('Unsave job error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing saved job',
      error: error.message
    });
  }
};

// ==========================================
// GET SAVED JOBS (Manpower Users Only)
// ==========================================
const getSavedJobs = async (req, res) => {
  const userId = req.user.userId;

  try {
    const [savedJobs] = await db.query(
      `SELECT 
        j.*,
        jpp.company_logo,
        jpp.company_size,
        sj.saved_at
       FROM saved_jobs sj
       JOIN jobs j ON sj.job_id = j.id
       LEFT JOIN job_poster_profiles jpp ON j.user_id = jpp.user_id
       WHERE sj.user_id = ?
       ORDER BY sj.saved_at DESC`,
      [userId]
    );

    res.status(200).json({
      success: true,
      jobs: savedJobs || [],
      count: savedJobs.length
    });

  } catch (error) {
    console.error('Get saved jobs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching saved jobs',
      error: error.message
    });
  }
};

// ==========================================
// CHECK IF JOB IS SAVED (Helper for frontend)
// ==========================================
const checkJobSaved = async (req, res) => {
  const userId = req.user.userId;
  const { jobId } = req.params;

  try {
    const [saved] = await db.query(
      'SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?',
      [userId, jobId]
    );

    res.status(200).json({
      success: true,
      isSaved: saved.length > 0
    });

  } catch (error) {
    console.error('Check job saved error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking saved status',
      error: error.message
    });
  }
};

module.exports = {
  searchJobs,
  getJobDetails,
  getJobRecommendations,
  getFeaturedJobs,
  getJobCategories,
  saveJob,
  unsaveJob,
  getSavedJobs,
  checkJobSaved
};