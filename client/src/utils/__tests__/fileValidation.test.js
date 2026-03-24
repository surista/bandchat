import { describe, it, expect } from 'vitest';
import {
  MAX_IMAGE_SIZE,
  MAX_AUDIO_SIZE,
  MAX_VIDEO_SIZE,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
  isImageFile,
  isAudioFile,
  isVideoFile,
} from '../fileValidation';

describe('file size constants', () => {
  it('MAX_IMAGE_SIZE is 15MB', () => {
    expect(MAX_IMAGE_SIZE).toBe(15 * 1024 * 1024);
  });

  it('MAX_AUDIO_SIZE is 30MB', () => {
    expect(MAX_AUDIO_SIZE).toBe(30 * 1024 * 1024);
  });

  it('MAX_VIDEO_SIZE is 50MB', () => {
    expect(MAX_VIDEO_SIZE).toBe(50 * 1024 * 1024);
  });
});

describe('allowed type arrays', () => {
  it('includes common image types', () => {
    expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
    expect(ALLOWED_IMAGE_TYPES).toContain('image/png');
    expect(ALLOWED_IMAGE_TYPES).toContain('image/gif');
    expect(ALLOWED_IMAGE_TYPES).toContain('image/webp');
  });

  it('includes common audio types', () => {
    expect(ALLOWED_AUDIO_TYPES).toContain('audio/mpeg');
    expect(ALLOWED_AUDIO_TYPES).toContain('audio/wav');
  });

  it('includes common video types', () => {
    expect(ALLOWED_VIDEO_TYPES).toContain('video/mp4');
    expect(ALLOWED_VIDEO_TYPES).toContain('video/webm');
  });
});

describe('isImageFile', () => {
  it('returns true for JPEG', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
  });

  it('returns true for PNG', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
  });

  it('returns true for any image/* type', () => {
    expect(isImageFile({ type: 'image/svg+xml' })).toBe(true);
  });

  it('returns false for audio', () => {
    expect(isImageFile({ type: 'audio/mpeg' })).toBe(false);
  });

  it('returns false for text', () => {
    expect(isImageFile({ type: 'text/plain' })).toBe(false);
  });
});

describe('isAudioFile', () => {
  it('returns true for MP3', () => {
    expect(isAudioFile({ type: 'audio/mpeg' })).toBe(true);
  });

  it('returns true for WAV', () => {
    expect(isAudioFile({ type: 'audio/wav' })).toBe(true);
  });

  it('returns true for any audio/* type', () => {
    expect(isAudioFile({ type: 'audio/flac' })).toBe(true);
  });

  it('returns false for video', () => {
    expect(isAudioFile({ type: 'video/mp4' })).toBe(false);
  });
});

describe('isVideoFile', () => {
  it('returns true for MP4', () => {
    expect(isVideoFile({ type: 'video/mp4' })).toBe(true);
  });

  it('returns true for WebM', () => {
    expect(isVideoFile({ type: 'video/webm' })).toBe(true);
  });

  it('returns true for any video/* type', () => {
    expect(isVideoFile({ type: 'video/ogg' })).toBe(true);
  });

  it('returns false for image', () => {
    expect(isVideoFile({ type: 'image/png' })).toBe(false);
  });
});
