import express from 'express';
import multer from 'multer';
import fileType from 'file-type';
import sharp from 'sharp';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { uploadFile } from '../lib/storage.js';
import prisma from '../lib/prisma.js';

// L1: Limit input pixels to prevent decompression bombs (100 megapixels)
sharp.limitInputPixels(100_000_000);

const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;

/**
 * Generate a thumbnail from an image buffer.
 * Returns { buffer, width, height } for the thumbnail, plus original dimensions.
 */
async function generateThumbnail(imageBuffer) {
  try {
    const image = sharp(imageBuffer, { limitInputPixels: 100_000_000 });
    const metadata = await image.metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    // Only generate thumbnail if image is wider than threshold
    if (origWidth <= THUMBNAIL_MAX_WIDTH) {
      return { thumbnail: null, width: origWidth, height: origHeight };
    }

    const thumbBuffer = await image
      .resize(THUMBNAIL_MAX_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toBuffer();

    return { thumbnail: thumbBuffer, width: origWidth, height: origHeight };
  } catch {
    return { thumbnail: null, width: null, height: null };
  }
}

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
 * Atomically check quota and reserve storage space.
 * Uses a transaction to prevent race conditions where concurrent uploads
 * could both pass the quota check before either increments the counter.
 * Returns null if OK, or an error response object if over quota.
 */
const reserveStorageQuota = async (workspaceId, fileSize) => {
  if (!workspaceId) return null;

  try {
    await prisma.$transaction(async (tx) => {
      // Lock the row and get current usage
      const workspace = await tx.workspace.findUnique({
        where: { id: workspaceId },
        select: { storageUsedBytes: true },
      });
      if (!workspace) return; // No workspace = no quota check

      const used = workspace.storageUsedBytes ?? 0n;
      if (used + BigInt(fileSize) > DEFAULT_STORAGE_QUOTA) {
        throw new Error('QUOTA_EXCEEDED');
      }

      // Atomically increment within the same transaction
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { storageUsedBytes: { increment: BigInt(fileSize) } },
      });
    }, {
      isolationLevel: 'Serializable', // Ensures no concurrent modifications
    });
    return null;
  } catch (error) {
    if (error.message === 'QUOTA_EXCEEDED') {
      return { error: 'Storage quota exceeded. Free tier allows 2 GB per workspace.' };
    }
    throw error;
  }
};

/**
 * Release reserved storage if upload fails after reservation.
 * Uses safe decrement to prevent underflow below 0.
 */
const releaseStorageQuota = async (workspaceId, fileSize) => {
  if (!workspaceId) return;

  await safeDecrementStorage(workspaceId, fileSize);
};

/**
 * Safely decrement storage, preventing underflow below 0.
 * Exported so other routes can use the same safe pattern.
 */
export const safeDecrementStorage = async (workspaceId, bytes) => {
  if (!workspaceId || !bytes || bytes <= 0) return;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { storageUsedBytes: true },
  });
  if (!workspace) return;

  const current = workspace.storageUsedBytes ?? 0n;
  const decrement = BigInt(bytes);
  const newValue = current > decrement ? current - decrement : 0n;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { storageUsedBytes: newValue },
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

    // Require workspaceId so storage quota is always enforced
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Atomically check and reserve storage quota
    const quotaError = await reserveStorageQuota(workspaceId, req.file.size);
    if (quotaError) {
      return res.status(413).json(quotaError);
    }

    // Upload to R2 (release reservation if upload fails)
    let result;
    let thumbnailUrl = null;
    let width = null;
    let height = null;
    try {
      const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : 'video';
      result = await uploadFile(req.file.buffer, req.file.originalname, detectedType, folder);

      // Generate thumbnail for images
      if (fileCategory === 'IMAGE') {
        const thumbData = await generateThumbnail(req.file.buffer);
        width = thumbData.width;
        height = thumbData.height;
        if (thumbData.thumbnail) {
          const thumbResult = await uploadFile(thumbData.thumbnail, `thumb_${req.file.originalname}`, 'image/jpeg', 'thumbnails');
          thumbnailUrl = thumbResult.url;
        }
      }
    } catch (uploadError) {
      await releaseStorageQuota(workspaceId, req.file.size);
      throw uploadError;
    }

    res.json({
      url: result.url,
      filename: req.file.originalname,
      size: req.file.size,
      type: fileCategory,
      ...(thumbnailUrl && { thumbnailUrl }),
      ...(width && { width }),
      ...(height && { height })
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
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

    // Require workspaceId so storage quota is always enforced
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Atomically check and reserve storage quota for total batch size
    const quotaError = await reserveStorageQuota(workspaceId, totalSize);
    if (quotaError) {
      return res.status(413).json(quotaError);
    }

    // Upload all files to R2 (release reservation if any upload fails)
    let results;
    try {
      const uploadPromises = fileValidations.map(async ({ file, detectedType, fileCategory }) => {
        const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : 'video';
        const result = await uploadFile(file.buffer, file.originalname, detectedType, folder);
        let thumbnailUrl = null;
        let width = null;
        let height = null;
        if (fileCategory === 'IMAGE') {
          const thumbData = await generateThumbnail(file.buffer);
          width = thumbData.width;
          height = thumbData.height;
          if (thumbData.thumbnail) {
            const thumbResult = await uploadFile(thumbData.thumbnail, `thumb_${file.originalname}`, 'image/jpeg', 'thumbnails');
            thumbnailUrl = thumbResult.url;
          }
        }
        return { ...result, thumbnailUrl, width, height };
      });
      results = await Promise.all(uploadPromises);
    } catch (uploadError) {
      await releaseStorageQuota(workspaceId, totalSize);
      throw uploadError;
    }

    const files = results.map((result, index) => ({
      url: result.url,
      filename: req.files[index].originalname,
      size: req.files[index].size,
      type: fileValidations[index].fileCategory,
      ...(result.thumbnailUrl && { thumbnailUrl: result.thumbnailUrl }),
      ...(result.width && { width: result.width }),
      ...(result.height && { height: result.height })
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
    console.error('Upload middleware error:', error.message);
    return res.status(400).json({ error: 'Invalid file upload' });
  }
  next();
});

export default router;
