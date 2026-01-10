import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Check if Cloudinary is configured
const isCloudinaryConfigured = () => {
  return process.env.CLOUDINARY_URL || (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
};

// Configure Cloudinary if credentials exist
if (process.env.CLOUDINARY_URL) {
  // CLOUDINARY_URL is automatically read by the SDK
  console.log('Cloudinary configured via CLOUDINARY_URL');
} else if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('Cloudinary configured via individual variables');
} else {
  console.warn('Cloudinary not configured - missing environment variables');
}

// Use memory storage for Cloudinary uploads
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  }
};

// Configure multer with 10MB limit
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    // Convert buffer to base64 data URI
    const base64 = buffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    cloudinary.uploader.upload(dataUri, {
      folder: 'bandchat',
      resource_type: 'image',
      public_id: `${Date.now()}-${originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_')}`
    })
    .then(result => resolve(result))
    .catch(error => reject(error));
  });
};

// Upload single image
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  try {
    // Check if Cloudinary is configured
    if (!isCloudinaryConfigured()) {
      console.error('Upload failed: Cloudinary not configured');
      return res.status(500).json({
        error: 'Image uploads not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    res.json({
      url: result.secure_url,
      filename: req.file.originalname,
      size: req.file.size,
      type: 'IMAGE'
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// Upload multiple images (up to 5)
router.post('/multiple', authenticate, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Upload all files to Cloudinary
    const uploadPromises = req.files.map(file =>
      uploadToCloudinary(file.buffer, file.originalname)
    );
    const results = await Promise.all(uploadPromises);

    const files = results.map((result, index) => ({
      url: result.secure_url,
      filename: req.files[index].originalname,
      size: req.files[index].size,
      type: 'IMAGE'
    }));

    res.json({ files });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds 10MB limit' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

export default router;
