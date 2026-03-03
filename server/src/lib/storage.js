import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import path from 'path';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bandchat';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://pub-xxx.r2.dev

let s3Client = null;

function getClient() {
  if (!s3Client) {
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 storage not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * @param {Buffer} buffer - File content
 * @param {string} originalFilename - Original filename for extension
 * @param {string} contentType - MIME type
 * @param {string} category - 'images', 'audio', or 'video'
 * @returns {Promise<{url: string, key: string, size: number}>}
 */
export async function uploadFile(buffer, originalFilename, contentType, category) {
  const client = getClient();
  const ext = path.extname(originalFilename) || '';
  const key = `${category}/${randomUUID()}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;
  return { url, key, size: buffer.length };
}

/**
 * Delete a file from R2 by its key or full URL.
 * @param {string} keyOrUrl - R2 object key or full public URL
 */
export async function deleteFile(keyOrUrl) {
  const client = getClient();
  const key = keyOrUrl.startsWith('http') ? extractKeyFromUrl(keyOrUrl) : keyOrUrl;
  if (!key) return;

  await client.send(new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  }));
}

/**
 * List all objects in the R2 bucket.
 * @returns {Promise<Array<{key: string, size: number, lastModified: Date}>>}
 */
export async function listAllObjects() {
  const client = getClient();
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    if (response.Contents) {
      for (const obj of response.Contents) {
        objects.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

/**
 * Check if R2 storage is configured and reachable.
 * @returns {Promise<boolean>}
 */
export async function isConfigured() {
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_URL) {
    return false;
  }
  try {
    const client = getClient();
    await client.send(new HeadBucketCommand({ Bucket: R2_BUCKET_NAME }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the R2 object key from a public URL.
 * @param {string} url - Full public URL
 * @returns {string|null}
 */
export function extractKeyFromUrl(url) {
  if (!R2_PUBLIC_URL || !url.startsWith(R2_PUBLIC_URL)) return null;
  return url.slice(R2_PUBLIC_URL.length + 1); // +1 for the /
}

/**
 * Check if a URL is an R2 URL.
 */
export function isR2Url(url) {
  return R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL);
}

export default { uploadFile, deleteFile, listAllObjects, isConfigured, extractKeyFromUrl, isR2Url };
