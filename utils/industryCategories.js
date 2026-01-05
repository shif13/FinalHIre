// utils/industryCategories.js

/**
 * Comprehensive Industry Categories for Job Postings
 * Covers all major sectors globally
 */

const INDUSTRY_CATEGORIES = [
  // Construction & Infrastructure
  'Construction & Building',
  'Civil Engineering',
  'Architecture & Design',
  'Real Estate & Property',
  
  // Manufacturing & Production
  'Manufacturing & Production',
  'Automotive & Vehicles',
  'Aerospace & Aviation',
  'Electronics & Electrical',
  'Textiles & Apparel',
  'Food & Beverage Production',
  
  // Energy & Resources
  'Oil & Gas',
  'Mining & Metals',
  'Renewable Energy',
  'Utilities & Power',
  
  // Technology & IT
  'Information Technology',
  'Software Development',
  'Telecommunications',
  'Cybersecurity',
  'Data Science & Analytics',
  
  // Healthcare & Medical
  'Healthcare & Medical',
  'Pharmaceuticals',
  'Biotechnology',
  'Medical Devices',
  
  // Finance & Business
  'Banking & Finance',
  'Insurance',
  'Accounting & Auditing',
  'Consulting & Strategy',
  'Human Resources',
  
  // Retail & Commerce
  'Retail & E-commerce',
  'Wholesale & Distribution',
  'Supply Chain & Logistics',
  'Transportation & Delivery',
  
  // Hospitality & Services
  'Hotels & Hospitality',
  'Tourism & Travel',
  'Restaurants & Food Service',
  'Event Management',
  
  // Education & Training
  'Education & Training',
  'E-Learning & EdTech',
  'Research & Development',
  
  // Media & Entertainment
  'Media & Broadcasting',
  'Advertising & Marketing',
  'Entertainment & Arts',
  'Publishing & Printing',
  
  // Agriculture & Environment
  'Agriculture & Farming',
  'Forestry & Fisheries',
  'Environmental Services',
  'Waste Management',
  
  // Professional Services
  'Legal Services',
  'Engineering Services',
  'Security Services',
  'Facilities Management',
  'Cleaning & Maintenance',
  
  // Government & Non-Profit
  'Government & Public Sector',
  'Non-Profit & NGO',
  'Social Services',
  
  // Other
  'Other Industries'
];

/**
 * Job Types - Employment Categories
 */
const JOB_TYPES = [
  { value: 'full-time', label: 'Full-Time' },
  { value: 'part-time', label: 'Part-Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'internship', label: 'Internship' }
];

/**
 * Experience Levels
 */
const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry Level (0-2 years)' },
  { value: 'mid', label: 'Mid Level (2-5 years)' },
  { value: 'senior', label: 'Senior Level (5-10 years)' },
  { value: 'executive', label: 'Executive (10+ years)' }
];

/**
 * Company Sizes
 */
const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '500+', label: '500+ employees' }
];

/**
 * Salary Ranges (Flexible - users can also enter custom)
 */
const SALARY_RANGES = [
  'Negotiable',
  'Undisclosed',
  '$10,000 - $20,000',
  '$20,000 - $30,000',
  '$30,000 - $40,000',
  '$40,000 - $50,000',
  '$50,000 - $75,000',
  '$75,000 - $100,000',
  '$100,000 - $150,000',
  '$150,000+'
];

/**
 * Job Status Options
 */
const JOB_STATUS = [
  { value: 'open', label: 'Open', color: 'green' },
  { value: 'closed', label: 'Closed', color: 'gray' },
  { value: 'filled', label: 'Filled', color: 'blue' }
];

/**
 * Default Job Expiry Days
 */
const DEFAULT_JOB_EXPIRY_DAYS = 30;

/**
 * Helper: Get industry by partial match
 */
const findIndustry = (searchTerm) => {
  const term = searchTerm.toLowerCase();
  return INDUSTRY_CATEGORIES.find(industry => 
    industry.toLowerCase().includes(term)
  );
};

/**
 * Helper: Validate industry
 */
const isValidIndustry = (industry) => {
  return INDUSTRY_CATEGORIES.includes(industry);
};

module.exports = {
  INDUSTRY_CATEGORIES,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  COMPANY_SIZES,
  SALARY_RANGES,
  JOB_STATUS,
  DEFAULT_JOB_EXPIRY_DAYS,
  findIndustry,
  isValidIndustry
};