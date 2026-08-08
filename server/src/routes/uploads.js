import express from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { uploadFile, deleteFile, isR2Url } from '../lib/storage.js';
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
    // EXIF orientations 5-8 mean the pixels are stored rotated a quarter turn,
    // so sharp's reported width/height are transposed relative to what a viewer
    // actually displays. Report the display dimensions — clients use these for
    // aspect ratio, and a transposed pair sizes the image sideways.
    const rotatedQuarterTurn = metadata.orientation >= 5 && metadata.orientation <= 8;
    const origWidth = (rotatedQuarterTurn ? metadata.height : metadata.width) || 0;
    const origHeight = (rotatedQuarterTurn ? metadata.width : metadata.height) || 0;

    // Only generate thumbnail if image is wider than threshold
    if (origWidth <= THUMBNAIL_MAX_WIDTH) {
      return { thumbnail: null, width: origWidth, height: origHeight };
    }

    const thumbBuffer = await image
      // Bakes the EXIF orientation into the pixels. Required because sharp
      // strips EXIF on output: without this the thumbnail keeps the unrotated
      // pixels AND loses the tag that told viewers to rotate them, so an iPhone
      // photo renders sideways in the message list while the full-size original
      // opens upright in the lightbox.
      .rotate()
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

// Allowed MIME types (validated by magic bytes).
// HEIC/HEIF accepted as a fallback for iPhone clients that skip on-device
// transcoding — sharp re-encodes the thumbnail as JPEG when libvips has
// libheif support; otherwise the original HEIC is served and clients that
// can render it will (iOS Safari, modern Chrome on macOS). Legacy web
// browsers that can't render HEIC will see a broken image, so clients
// should still transcode before upload when possible.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/zip'];
// Guitar Pro files use custom detection (not standard MIME types)
const GUITAR_PRO_MIME = 'application/x-guitar-pro';
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// File size limits
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_AUDIO_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
// Avatar uploads are the one case with no workspace to bill (a user's own
// profile picture isn't owned by any band), so they get a tighter cap of
// their own instead of riding the general image limit.
const MAX_AVATAR_SIZE = 10 * 1024 * 1024; // 10MB

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

  // Allow .zip files by extension (magic bytes verified later)
  if (file.originalname.toLowerCase().endsWith('.zip')) {
    cb(null, true);
    return;
  }

  cb(new Error('Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, ZIP, and Guitar Pro files are allowed'), false);
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
  const detected = await fileTypeFromBuffer(buffer);

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

// Configure multer with the video/audio max as the hard cap; per-type
// validation runs in the handler so images/docs still get their tighter caps.
// NOTE: storage is memoryStorage — at 500MB per file, each concurrent upload
// holds ~500MB of RAM until R2 finishes. Monitor Railway memory if you see
// concurrent large uploads; switching to multer.diskStorage() is the
// follow-up if it becomes a problem.
const upload = multer({
  storage: memStorage,
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE
  }
});

/**
 * Resolve which workspace an upload should be billed to, enforcing that the
 * caller is actually a member of it.
 *
 * Every upload must name a workspace. The single exception is a user's own
 * profile avatar (`scope=avatar`), which belongs to no band and therefore has
 * nothing to bill — those are capped hard at MAX_AVATAR_SIZE and restricted to
 * images so the exception can't be used as a general-purpose free upload lane.
 *
 * Without this, omitting `workspaceId` skipped the membership check AND the
 * quota reservation entirely, so any authenticated user could push unmetered
 * data into R2.
 *
 * @returns {{ error: string, status: number } | { scope: 'avatar' } | { scope: 'workspace', workspaceId: string }}
 */
const resolveUploadTarget = async (req, { allowAvatar = false } = {}) => {
  const workspaceId = req.body.workspaceId || req.query.workspaceId;

  if (!workspaceId) {
    const scope = req.body.scope || req.query.scope;
    if (allowAvatar && scope === 'avatar') {
      return { scope: 'avatar' };
    }
    return { error: 'workspaceId is required', status: 400 };
  }

  if (!isValidUUID(workspaceId)) {
    return { error: 'Invalid workspace ID', status: 400 };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.user.id, workspaceId } }
  });
  if (!membership) {
    return { error: 'Not a workspace member', status: 403 };
  }

  return { scope: 'workspace', workspaceId };
};

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
        error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, ZIP, and Guitar Pro files are allowed.'
      });
    }

    // Resolve + authorize the billing target before doing any work.
    const target = await resolveUploadTarget(req, { allowAvatar: true });
    if (target.error) {
      return res.status(target.status).json({ error: target.error });
    }
    const isAvatar = target.scope === 'avatar';

    if (isAvatar && fileCategory !== 'IMAGE') {
      return res.status(400).json({ error: 'Avatar uploads must be an image.' });
    }

    // Validate file size based on type
    const maxSize = isAvatar
      ? MAX_AVATAR_SIZE
      : fileCategory === 'VIDEO' ? MAX_VIDEO_SIZE : fileCategory === 'AUDIO' ? MAX_AUDIO_SIZE : fileCategory === 'DOCUMENT' ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
    if (req.file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return res.status(400).json({
        error: `File size exceeds ${limitMB}MB limit for ${isAvatar ? 'avatar' : fileCategory.toLowerCase()} files.`
      });
    }

    // Reserve quota against the workspace (avatars have none to bill).
    const workspaceId = isAvatar ? null : target.workspaceId;
    if (workspaceId) {
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
          error: `Invalid file type for "${file.originalname}". Only images (JPEG, PNG, GIF, WebP), audio (MP3, WAV, OGG, M4A), video (MP4, MOV, WebM), PDF, ZIP, and Guitar Pro files are allowed.`
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

    // Multi-upload is only ever used for message attachments, which always
    // belong to a workspace — no avatar exception here.
    const target = await resolveUploadTarget(req);
    if (target.error) {
      return res.status(target.status).json({ error: target.error });
    }
    const workspaceId = target.workspaceId;

    const quotaError = await reserveStorageQuota(workspaceId, totalSize);
    if (quotaError) {
      return res.status(413).json(quotaError);
    }

    // Upload all files to R2. On partial failure we delete the files that DID
    // land before releasing the full reservation — otherwise the survivors
    // stay in R2 as orphans while their bytes are credited back, drifting the
    // workspace's counter below reality.
    const settled = await Promise.allSettled(
      fileValidations.map(async ({ file, detectedType, fileCategory }) => {
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
      })
    );

    const failure = settled.find(s => s.status === 'rejected');
    if (failure) {
      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        for (const url of [s.value.url, s.value.thumbnailUrl]) {
          if (url && isR2Url(url)) {
            try { await deleteFile(url); } catch { /* best effort */ }
          }
        }
      }
      await releaseStorageQuota(workspaceId, totalSize);
      throw failure.reason;
    }

    const results = settled.map(s => s.value);

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
      return res.status(400).json({ error: 'File size exceeds limit (15MB images, 10MB documents/ZIP, 500MB audio, 500MB video)' });
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
