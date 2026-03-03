import express from 'express';
import multer from 'multer';
import fileType from 'file-type';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { uploadFile } from '../lib/storage.js';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Dedicated rate limiter for uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skip: process.env.NODE_ENV === 'test' ? () => true : undefined,
  message: { error: 'Too many uploads, please try again later' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Allowed MIME types (validated by magic bytes)
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES];

// File size limits
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Storage quota: 2 GB default (can be adjusted per tier later)
const DEFAULT_STORAGE_QUOTA = 2n * 1024n * 1024n * 1024n; // 2 GB in bytes

// Use memory storage
const memStorage = multer.memoryStorage();

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
  storage: memStorage,
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE // 50MB max (video), smaller types validated separately
  }
});

/**
 * Check workspace storage quota before upload.
 * Returns null if OK, or an error response object if over quota.
 */
const checkStorageQuota = async (workspaceId, fileSize) => {
  if (!workspaceId) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { storageUsedBytes: true },
  });
  if (!workspace) return null;

  const used = workspace.storageUsedBytes ?? 0n;
  if (used + BigInt(fileSize) > DEFAULT_STORAGE_QUOTA) {
    return { error: 'Storage quota exceeded. Free tier allows 2 GB per workspace.' };
  }
  return null;
};

/**
 * Increment workspace storage counter after a successful upload.
 */
const trackStorageUsage = async (workspaceId, fileSize) => {
  if (!workspaceId) return;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { storageUsedBytes: { increment: BigInt(fileSize) } },
  });
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

    // Check workspace storage quota if workspaceId provided
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    const quotaError = await checkStorageQuota(workspaceId, req.file.size);
    if (quotaError) {
      return res.status(413).json(quotaError);
    }

    // Upload to R2
    const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : 'video';
    const result = await uploadFile(req.file.buffer, req.file.originalname, detectedType, folder);

    // Track storage usage
    await trackStorageUsage(workspaceId, req.file.size);

    res.json({
      url: result.url,
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
    let totalSize = 0;
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

      totalSize += file.size;
      fileValidations.push({ file, detectedType, fileCategory });
    }

    // Check workspace storage quota for total batch size
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    const quotaError = await checkStorageQuota(workspaceId, totalSize);
    if (quotaError) {
      return res.status(413).json(quotaError);
    }

    // Upload all files to R2
    const uploadPromises = fileValidations.map(({ file, detectedType, fileCategory }) => {
      const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : 'video';
      return uploadFile(file.buffer, file.originalname, detectedType, folder);
    });
    const results = await Promise.all(uploadPromises);

    // Track storage usage for total batch
    await trackStorageUsage(workspaceId, totalSize);

    const files = results.map((result, index) => ({
      url: result.url,
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
