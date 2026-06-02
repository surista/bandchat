/**
 * Shared file type and size validation constants and helpers.
 */

/** Maximum file size for uploads — keep in sync with server/src/routes/uploads.js */
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
export const MAX_AUDIO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

/** Allowed file types */
// HEIC/HEIF included for parity with mobile uploads from iPhone camera roll.
// Most modern browsers don't render HEIC natively — mobile transcodes to JPEG
// on-device; desktop browsers that upload .heic will still reach the server.
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/zip', 'application/x-zip-compressed'];

export const isImageFile = (file) => file.type.startsWith('image/') || ALLOWED_IMAGE_TYPES.includes(file.type);
export const isAudioFile = (file) => file.type.startsWith('audio/') || ALLOWED_AUDIO_TYPES.includes(file.type);
export const isVideoFile = (file) => file.type.startsWith('video/') || ALLOWED_VIDEO_TYPES.includes(file.type);
export const isDocumentFile = (file) => ALLOWED_DOCUMENT_TYPES.includes(file.type) || file.name?.toLowerCase().endsWith('.zip') || file.name?.toLowerCase().endsWith('.pdf');
