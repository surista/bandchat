import express from 'express';
import multer from 'multer';
import fileType from 'file-type';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Dedicated rate limiter for uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many uploads, please try again later' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Cloudinary cloud name for unsigned uploads - environment variables required
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
  console.warn('Warning: CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET must be set for file uploads to work');
}

// Allowed MIME types (validated by magic bytes)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES];

// File size limits
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Use memory storage for Cloudinary uploads
const storage = multer.memoryStorage();

// Initial file filter based on declared MIME type (will be verified by magic bytes later)
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), and video (MP4, MOV, WebM) files are allowed'), false);
  }
};

/**
 * Validates file content by checking magic bytes (file signature).
 * Prevents MIME type spoofing attacks.
 * @param {Buffer} buffer - File buffer to validate
 * @returns {Promise<{valid: boolean, detectedType: string|null, fileCategory: string|null}>}
 */
const validateFileType = async (buffer) => {
  const detected = await fileType.fromBuffer(buffer);

  if (!detected) {
    return { valid: false, detectedType: null, fileCategory: null };
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(detected.mime);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(detected.mime);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(detected.mime);
  const isValid = isImage || isAudio || isVideo;
  const fileCategory = isImage ? 'IMAGE' : isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : null;

  return { valid: isValid, detectedType: detected.mime, fileCategory };
};

// Configure multer with 50MB limit (will validate per-type in handler)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE // 50MB max (video), smaller types validated separately
  }
});

// Helper to upload buffer to Cloudinary using unsigned upload
const uploadToCloudinary = async (buffer, originalname, fileCategory, mimeType) => {
  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  const formData = new FormData();
  formData.append('file', dataUri);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'bandchat');

  // Cloudinary uses 'video' endpoint for both video and audio files
  const resourceType = (fileCategory === 'AUDIO' || fileCategory === 'VIDEO') ? 'video' : 'image';

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
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

// Upload single file (image, audio, or video)
router.post('/', authenticate, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type by magic bytes (prevents MIME spoofing)
    const { valid, detectedType, fileCategory } = await validateFileType(req.file.buffer);
    if (!valid) {
      return res.status(400).json({
        error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), and video (MP4, MOV, WebM) are allowed.'
      });
    }

    // Validate file size based on type
    const maxSize = fileCategory === 'VIDEO' ? MAX_VIDEO_SIZE : fileCategory === 'AUDIO' ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
    if (req.file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return res.status(400).json({
        error: `File size exceeds ${limitMB}MB limit for ${fileCategory.toLowerCase()} files.`
      });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, fileCategory, detectedType);

    res.json({
      url: result.secure_url,
      filename: req.file.originalname,
      size: req.file.size,
      type: fileCategory
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// Upload multiple files (up to 5)
router.post('/multiple', authenticate, uploadLimiter, upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Validate all files by magic bytes and size before uploading
    const fileValidations = [];
    for (const file of req.files) {
      const { valid, detectedType, fileCategory } = await validateFileType(file.buffer);
      if (!valid) {
        return res.status(400).json({
          error: `Invalid file type for "${file.originalname}". Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), and video (MP4, MOV, WebM) are allowed.`
        });
      }

      // Validate file size based on type
      const maxSize = fileCategory === 'VIDEO' ? MAX_VIDEO_SIZE : fileCategory === 'AUDIO' ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        const limitMB = maxSize / (1024 * 1024);
        return res.status(400).json({
          error: `File "${file.originalname}" exceeds ${limitMB}MB limit for ${fileCategory.toLowerCase()} files.`
        });
      }

      fileValidations.push({ file, detectedType, fileCategory });
    }

    // Upload all files to Cloudinary
    const uploadPromises = fileValidations.map(({ file, detectedType, fileCategory }) =>
      uploadToCloudinary(file.buffer, file.originalname, fileCategory, detectedType)
    );
    const results = await Promise.all(uploadPromises);

    const files = results.map((result, index) => ({
      url: result.secure_url,
      filename: req.files[index].originalname,
      size: req.files[index].size,
      type: fileValidations[index].fileCategory
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
      return res.status(400).json({ error: 'File size exceeds limit (10MB images, 30MB audio, 50MB video)' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

export default router;
