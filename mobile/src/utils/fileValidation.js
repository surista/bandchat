/**
 * Shared file size validation constants — keep in sync with
 * server/src/routes/uploads.js (and client/src/utils/fileValidation.js on web).
 */

export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
export const MAX_AUDIO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Mirrors the server's fileCategory detection (uploads.js validateFileType)
 * closely enough for a client-side pre-check — the server is still the
 * authoritative gatekeeper since it validates by magic bytes, not MIME type.
 * Returns null for an unrecognized/missing type (e.g. Guitar Pro files, or a
 * file the OS reports as 'application/octet-stream') so callers can skip the
 * pre-check and let the server's magic-byte detection decide, rather than
 * guessing wrong and blocking a valid upload (an audio file some Android
 * content providers mis-report as octet-stream, for instance).
 */
export function getMaxSizeForMimeType(mimeType) {
  if (mimeType?.startsWith('image/')) return MAX_IMAGE_SIZE;
  if (mimeType?.startsWith('audio/')) return MAX_AUDIO_SIZE;
  if (mimeType?.startsWith('video/')) return MAX_VIDEO_SIZE;
  if (mimeType === 'application/pdf' || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') return MAX_DOCUMENT_SIZE;
  return null;
}
