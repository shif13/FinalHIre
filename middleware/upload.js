const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =============================================================
// Ensure uploads directory exists
// =============================================================
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory:', uploadsDir);
}

// =============================================================
// Multer Storage Configuration
// =============================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// =============================================================
// File Filter (validates file types)
// =============================================================
const fileFilter = (req, file, cb) => {
  console.log(`🔎 File filter triggered: ${file.fieldname} (${file.mimetype})`);

  const imageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (file.fieldname === 'profilePhoto') {
    if (imageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Profile photo must be an image file (jpg, png, webp).'), false);
    }
  } else if (file.fieldname === 'cv') {
    if (docTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('CV must be a PDF or Word document.'), false);
    }
  } else if (file.fieldname === 'certificates') {
    if ([...docTypes, ...imageTypes].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Certificates must be PDF or image files.'), false);
    }
  } else if (file.fieldname === 'equipmentImages') {
    if (imageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Equipment images must be image files.'), false);
    }
  } else {
    // Allow unknown fields to pass through (for flexibility)
    cb(null, true);
  }
};

// =============================================================
// Multer Configuration
// =============================================================
const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20 // Maximum 20 files total
  }
});

// =============================================================
// ✅ Export middleware with ALL required fields
// =============================================================
const uploadFields = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'certificates', maxCount: 10 },
  { name: 'equipmentImages', maxCount: 10 }
]);

module.exports = { uploadFields };