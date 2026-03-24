import express from 'express';
import multer from 'multer';
import fileType from 'file-type';
import sharp from 'sharp';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { uploadFile } from '../lib/storage.js';
import prisma from '../lib/prisma.js';
import { getEffectivePlan, getPlanLimits } from '../lib/planLimits.js';
import { isValidUUID } from '../lib/validators.js';

const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;
const MAX_INPUT_PIXELS = 100_000_000; // 100 megapixels - prevent decompression bombs

/**
 * Generate a thumbnail from an image buffer.
 * Returns { buffer, width, height } for the thumbnail, plus original dimensions.
 */
async function generateThumbnail(imageBuffer) {
  try {
    const image = sharp(imageBuffer, { limitInputPixels: MAX_INPUT_PIXELS });
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
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
// Guitar Pro files use custom detection (not standard MIME types)
const GUITAR_PRO_MIME = 'application/x-guitar-pro';
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// File size limits
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

// Use memory storage
const memStorage = multer.memoryStorage();

// Guitar Pro file extensions (for initial filter)
const GUITAR_PRO_EXTENSIONS = ['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp6', '.gp7'];

/**
 * Detect Guitar Pro files by magic bytes.
 * GP3/GP4/GP5: Start with length byte + "FICHIER GUITAR PRO v"
 * GPX (GP6+): ZIP archive containing Guitar Pro XML data
 * @param {Buffer} buffer - File content
 * @param {string} originalFilename - Original filename for extension check
 * @returns {{isGuitarPro: boolean, version: string|null}}
 */
const detectGuitarPro = (buffer, originalFilename) => {
  if (buffer.length < 32) return { isGuitarPro: false, version: null };

  // Check for GP3/GP4/GP5 signature: "FICHIER GUITAR PRO v" appears in first 32 bytes
  const headerStr = buffer.slice(0, 32).toString('latin1');
  if (headerStr.includes('FICHIER GUITAR PRO')) {
    const versionMatch = headerStr.match(/FICHIER GUITAR PRO v(\d)/);
    return { isGuitarPro: true, version: versionMatch ? `gp${versionMatch[1]}` : 'gp' };
  }

  // Check for GPX (ZIP archive with .gpx extension)
  // GPX files are ZIP archives - check for PK signature AND .gpx extension
  const ext = originalFilename.toLowerCase().slice(originalFilename.lastIndexOf('.'));
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && GUITAR_PRO_EXTENSIONS.includes(ext)) {
    return { isGuitarPro: true, version: 'gpx' };
  }

  return { isGuitarPro: false, version: null };
};

// Initial file filter based on declared MIME type (will be verified by magic bytes later)
// Also allows Guitar Pro files by extension (magic bytes verified later)
const fileFilter = (req, file, cb) => {
  // Check standard MIME types
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  // Check Guitar Pro files by extension (will validate magic bytes later)
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  if (GUITAR_PRO_EXTENSIONS.includes(ext)) {
    cb(null, true);
    return;
  }

  cb(new Error('Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, and Guitar Pro files are allowed'), false);
};

/**
 * Validates file content by checking magic bytes (file signature).
 * Prevents MIME type spoofing attacks.
 * @param {Buffer} buffer - File content
 * @param {string} originalFilename - Original filename for Guitar Pro extension check
 */
const validateFileType = async (buffer, originalFilename) => {
  // First, check for Guitar Pro files (custom detection)
  const guitarProResult = detectGuitarPro(buffer, originalFilename);
  if (guitarProResult.isGuitarPro) {
    return { valid: true, detectedType: GUITAR_PRO_MIME, fileCategory: 'DOCUMENT' };
  }

  // Standard file-type detection for other formats
  const detected = await fileType.fromBuffer(buffer);

  if (!detected) {
    return { valid: false, detectedType: null, fileCategory: null };
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(detected.mime);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(detected.mime);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(detected.mime);
  const isDocument = ALLOWED_DOCUMENT_TYPES.includes(detected.mime);
  const isValid = isImage || isAudio || isVideo || isDocument;
  const fileCategory = isImage ? 'IMAGE' : isAudio ? 'AUDIO' : isVideo ? 'VIDEO' : isDocument ? 'DOCUMENT' : null;

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
    // Atomic check-and-increment using $executeRawUnsafe to prevent TOCTOU race
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { storageUsedBytes: true, plan: true, planExpiresAt: true },
    });
    if (!workspace) return null;

    const limits = getPlanLimits(workspace);
    const fileSizeBigInt = BigInt(fileSize);

    // Atomic conditional update: only increment if within quota
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "Workspace" SET "storageUsedBytes" = "storageUsedBytes" + $1::bigint WHERE "id" = $2 AND "storageUsedBytes" + $1::bigint <= $3::bigint`,
      fileSizeBigInt,
      workspaceId,
      limits.storageBytes
    );

    if (updated === 0) {
      return { error: 'Storage limit reached. Upgrade to Pro for more storage.', upgrade: true };
    }
    return null;
  } catch (error) {
    // Don't block uploads on quota tracking errors
    console.error('Storage quota check error:', error.message);
    return null;
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
 * Uses atomic SQL to avoid race conditions with concurrent deletes.
 * Exported so other routes can use the same safe pattern.
 */
export const safeDecrementStorage = async (workspaceId, bytes) => {
  if (!workspaceId || !bytes || bytes <= 0) return;

  await prisma.$executeRawUnsafe(
    `UPDATE "Workspace" SET "storageUsedBytes" = GREATEST(0, "storageUsedBytes" - $1::bigint) WHERE "id" = $2`,
    BigInt(bytes),
    workspaceId
  );
};

// Upload single file (image, audio, or video)
router.post('/', authenticate, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate file type by magic bytes (prevents MIME spoofing)
    const { valid, detectedType, fileCategory } = await validateFileType(req.file.buffer, req.file.originalname);
    if (!valid) {
      return res.status(400).json({
        error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, and Guitar Pro files are allowed.'
      });
    }

    // Validate file size based on type
    const maxSize = fileCategory === 'VIDEO' ? MAX_VIDEO_SIZE : fileCategory === 'AUDIO' ? MAX_AUDIO_SIZE : fileCategory === 'DOCUMENT' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
    if (req.file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return res.status(400).json({
        error: `File size exceeds ${limitMB}MB limit for ${fileCategory.toLowerCase()} files.`
      });
    }

    // Check workspace storage quota if workspaceId provided
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    if (workspaceId) {
      if (!isValidUUID(workspaceId)) {
        return res.status(400).json({ error: 'Invalid workspace ID' });
      }
      const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: req.user.id, workspaceId } }
      });
      if (!membership) {
        return res.status(403).json({ error: 'Not a workspace member' });
      }
      const quotaError = await reserveStorageQuota(workspaceId, req.file.size);
      if (quotaError) {
        return res.status(413).json(quotaError);
      }
    }

    // Upload to R2 (release reservation if upload fails)
    let result;
    let thumbnailUrl = null;
    let width = null;
    let height = null;
    try {
      const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : fileCategory === 'VIDEO' ? 'video' : 'documents';
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
      const { valid, detectedType, fileCategory } = await validateFileType(file.buffer, file.originalname);
      if (!valid) {
        return res.status(400).json({
          error: `Invalid file type for "${file.originalname}". Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, and Guitar Pro files are allowed.`
        });
      }

      // Validate file size based on type
      const maxSize = fileCategory === 'VIDEO' ? MAX_VIDEO_SIZE : fileCategory === 'AUDIO' ? MAX_AUDIO_SIZE : fileCategory === 'DOCUMENT' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        const limitMB = maxSize / (1024 * 1024);
        return res.status(400).json({
          error: `File "${file.originalname}" exceeds ${limitMB}MB limit for ${fileCategory.toLowerCase()} files.`
        });
      }

      totalSize += file.size;
      fileValidations.push({ file, detectedType, fileCategory });
    }

    // Check workspace storage quota if workspaceId provided
    const workspaceId = req.body.workspaceId || req.query.workspaceId;
    if (workspaceId) {
      if (!isValidUUID(workspaceId)) {
        return res.status(400).json({ error: 'Invalid workspace ID' });
      }
      const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: req.user.id, workspaceId } }
      });
      if (!membership) {
        return res.status(403).json({ error: 'Not a workspace member' });
      }
      const quotaError = await reserveStorageQuota(workspaceId, totalSize);
      if (quotaError) {
        return res.status(413).json(quotaError);
      }
    }

    // Upload all files to R2 (release reservation if any upload fails)
    let results;
    try {
      const uploadPromises = fileValidations.map(async ({ file, detectedType, fileCategory }) => {
        const folder = fileCategory === 'IMAGE' ? 'images' : fileCategory === 'AUDIO' ? 'audio' : fileCategory === 'VIDEO' ? 'video' : 'documents';
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
      return res.status(400).json({ error: 'File size exceeds limit (10MB images/documents, 30MB audio, 50MB video)' });
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
