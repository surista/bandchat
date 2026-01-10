import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Cloudinary cloud name for unsigned uploads
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'drlkgdvlk';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'bandchat';

console.log(`Cloudinary configured for unsigned uploads to cloud: ${CLOUDINARY_CLOUD_NAME}`);

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

// Helper to upload buffer to Cloudinary using unsigned upload
const uploadToCloudinary = async (buffer, originalname) => {
  const base64 = buffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'bandchat');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Upload failed');
  }

  return response.json();
};

// Upload single image
router.post('/', authenticate, upload.single('file'), async (req, res) => {
  try {

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
