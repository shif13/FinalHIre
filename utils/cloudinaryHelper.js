const cloudinary = require('../config/cloudinary');
const fs = require('fs');

// ✅ Upload to Cloudinary
const uploadToCloudinary = async (filePath, folder = 'uploads') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: 'auto',
    });

    // delete local file after upload
    fs.unlink(filePath, (err) => {
      if (err) console.warn('⚠️ Failed to delete local file:', filePath);
    });

    return result.secure_url;
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw error;
  }
};

// ✅ Delete from Cloudinary using URL
const deleteFromCloudinary = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    const parts = fileUrl.split('/');
    const filename = parts.pop().split('.')[0];
    const folder = parts.pop();
    const publicId = `${folder}/${filename}`;

    await cloudinary.uploader.destroy(publicId);
    console.log('🧹 Deleted from Cloudinary:', publicId);
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
  }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };
