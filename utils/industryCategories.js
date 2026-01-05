// utils/industryCategories.js - Complete Industry Categories

const INDUSTRY_CATEGORIES = [
  // Construction & Infrastructure
  'Construction & Civil Engineering',
  'Architecture & Design',
  'Real Estate Development',
  'Interior Design & Fit-out',
  
  // Oil, Gas & Energy
  'Oil & Gas',
  'Renewable Energy',
  'Power Generation & Distribution',
  'Energy Services',
  
  // Manufacturing & Production
  'Manufacturing & Production',
  'Automotive Manufacturing',
  'Food & Beverage Production',
  'Textile & Garment Manufacturing',
  'Chemical Manufacturing',
  'Pharmaceutical Manufacturing',
  
  // Information Technology
  'Information Technology',
  'Software Development',
  'Cybersecurity',
  'Cloud Computing & DevOps',
  'Data Science & Analytics',
  'Web & Mobile Development',
  
  // Healthcare & Medical
  'Healthcare & Medical',
  'Hospitals & Clinics',
  'Pharmaceuticals',
  'Medical Devices & Equipment',
  'Healthcare Services',
  
  // Engineering Services
  'Mechanical Engineering',
  'Electrical Engineering',
  'Chemical Engineering',
  'Industrial Engineering',
  'Environmental Engineering',
  
  // Transportation & Logistics
  'Transportation & Logistics',
  'Supply Chain Management',
  'Warehousing & Distribution',
  'Freight & Shipping',
  'Aviation & Aerospace',
  
  // Hospitality & Tourism
  'Hospitality & Hotels',
  'Restaurants & Food Services',
  'Tourism & Travel',
  'Event Management',
  
  // Retail & E-commerce
  'Retail & Consumer Goods',
  'E-commerce',
  'Wholesale & Distribution',
  
  // Finance & Banking
  'Banking & Financial Services',
  'Insurance',
  'Investment & Asset Management',
  'Fintech',
  
  // Telecommunications
  'Telecommunications',
  'Network Infrastructure',
  'Telecom Services',
  
  // Education & Training
  'Education & Training',
  'E-learning & EdTech',
  'Corporate Training',
  
  // Mining & Metals
  'Mining & Extraction',
  'Metals & Metallurgy',
  'Mineral Processing',
  
  // Agriculture & Food
  'Agriculture & Farming',
  'Food Processing',
  'Agritech',
  
  // Media & Entertainment
  'Media & Entertainment',
  'Broadcasting',
  'Film & Video Production',
  'Digital Media',
  
  // Professional Services
  'Consulting Services',
  'Legal Services',
  'Accounting & Audit',
  'Human Resources',
  'Marketing & Advertising',
  
  // Government & Public Sector
  'Government & Public Administration',
  'Defense & Security',
  'Public Utilities',
  
  // Environmental Services
  'Environmental Services',
  'Waste Management',
  'Water Treatment',
  
  // Security Services
  'Security Services',
  'Facility Management',
  
  // Other
  'Other Industries'
];

// Job Types
const JOB_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'temporary',
  'internship'
];

// Experience Levels
const EXPERIENCE_LEVELS = [
  'entry',
  'mid',
  'senior',
  'executive'
];

// Company Sizes
const COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+'
];

// Default job expiry days
const DEFAULT_JOB_EXPIRY_DAYS = 30;

// Validation functions
const isValidIndustry = (industry) => {
  return INDUSTRY_CATEGORIES.includes(industry);
};

const isValidJobType = (jobType) => {
  return JOB_TYPES.includes(jobType);
};

const isValidExperienceLevel = (level) => {
  return EXPERIENCE_LEVELS.includes(level);
};

const isValidCompanySize = (size) => {
  return COMPANY_SIZES.includes(size);
};

// Get expiry date from now
const getExpiryDate = (daysFromNow = DEFAULT_JOB_EXPIRY_DAYS) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
};

module.exports = {
  INDUSTRY_CATEGORIES,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  COMPANY_SIZES,
  DEFAULT_JOB_EXPIRY_DAYS,
  isValidIndustry,
  isValidJobType,
  isValidExperienceLevel,
  isValidCompanySize,
  getExpiryDate
};