import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// iPhone photos default to HEIC/HEIF since iOS 11. Most browsers and our server's
// image pipeline (sharp without libheif) do not accept them, so we transcode
// to JPEG locally before upload. Converting on-device is lossless-once-reencoded
// and keeps uploads deterministic across platforms.

const HEIC_MIME = /^image\/(heic|heif)/i;
const HEIC_EXT = /\.(heic|heif)$/i;

function isHeic(asset) {
  if (!asset) return false;
  if (asset.mimeType && HEIC_MIME.test(asset.mimeType)) return true;
  if (typeof asset.uri === 'string' && HEIC_EXT.test(asset.uri.split('?')[0])) return true;
  if (typeof asset.fileName === 'string' && HEIC_EXT.test(asset.fileName)) return true;
  return false;
}

function jpegFilename(asset) {
  const base = asset.fileName || 'image';
  return base.replace(HEIC_EXT, '.jpg').replace(/\.[^.]+$/, '.jpg');
}

/**
 * Normalize a single image-picker asset for upload. Transcodes HEIC/HEIF to
 * JPEG; leaves other formats untouched. Safe to call on any asset — it
 * short-circuits when no conversion is needed.
 *
 * @param {object} asset - expo-image-picker asset ({ uri, mimeType, fileName, width, height, ... })
 * @returns {Promise<object>} normalized asset with uri/mimeType/fileName updated when transcoded
 */
export async function prepareImageForUpload(asset) {
  if (!asset || !asset.uri) return asset;
  if (asset.type === 'video') return asset;
  if (!isHeic(asset)) return asset;

  try {
    const result = await manipulateAsync(asset.uri, [], {
      compress: 0.85,
      format: SaveFormat.JPEG,
    });
    return {
      ...asset,
      uri: result.uri,
      mimeType: 'image/jpeg',
      fileName: jpegFilename(asset),
      width: result.width || asset.width,
      height: result.height || asset.height,
    };
  } catch (err) {
    // If transcoding fails, fall through with the original asset — the server
    // will reject HEIC and the user will see a clearer error than a crash.
    console.warn('[prepareImageForUpload] HEIC transcode failed:', err?.message || err);
    return asset;
  }
}

/**
 * Convenience for array results from launchImageLibraryAsync with allowsMultipleSelection.
 */
export async function prepareImagesForUpload(assets) {
  if (!Array.isArray(assets)) return assets;
  return Promise.all(assets.map(prepareImageForUpload));
}
