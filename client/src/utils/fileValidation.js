/**
 * Shared file type and size validation constants and helpers.
 */

/** Maximum file size for uploads */
export const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
export const MAX_AUDIO_SIZE = 30 * 1024 * 1024; // 30MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

/** Allowed file types */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/mp4'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

export const isImageFile = (file) => file.type.startsWith('image/') || ALLOWED_IMAGE_TYPES.includes(file.type);
export const isAudioFile = (file) => file.type.startsWith('audio/') || ALLOWED_AUDIO_TYPES.includes(file.type);
export const isVideoFile = (file) => file.type.startsWith('video/') || ALLOWED_VIDEO_TYPES.includes(file.type);
