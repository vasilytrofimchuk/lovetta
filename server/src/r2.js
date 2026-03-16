/**
 * Cloudflare R2 storage — upload images/videos and return public URLs.
 * Uses S3-compatible API via @aws-sdk/client-s3.
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'lovetta';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

let s3 = null;

function getClient() {
  if (s3) return s3;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null;
  }
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return s3;
}

const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Download a file from a URL and upload it to R2.
 * @param {string} sourceUrl - The URL to download from (e.g. fal.ai temporary URL)
 * @param {string} folder - R2 folder path (e.g. 'avatars', 'images', 'videos')
 * @param {object} opts - { filename?, extension? }
 * @returns {{ url: string, key: string }} Public URL and R2 key
 */
async function uploadFromUrl(sourceUrl, folder, opts = {}) {
  const client = getClient();
  if (!client || !R2_PUBLIC_URL) {
    // R2 not configured — return original URL
    console.warn('[r2] Not configured, returning source URL');
    return { url: sourceUrl, key: null };
  }

  // Download the file
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download from ${sourceUrl}: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Determine extension from source URL or content type
  const contentType = response.headers.get('content-type') || '';
  let ext = opts.extension || '';
  if (!ext) {
    const urlPath = new URL(sourceUrl).pathname;
    ext = path.extname(urlPath) || '';
  }
  if (!ext) {
    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
    else if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('webm')) ext = '.webm';
    else ext = '.jpg'; // default
  }

  const filename = opts.filename || crypto.randomUUID();
  const key = `${folder}/${filename}${ext}`;
  const mime = MIME_TYPES[ext] || contentType || 'application/octet-stream';

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mime,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;
  return { url, key };
}

/**
 * Upload a buffer directly to R2.
 * @param {Buffer} buffer
 * @param {string} folder
 * @param {object} opts - { filename?, extension?, contentType? }
 */
async function uploadBuffer(buffer, folder, opts = {}) {
  const client = getClient();
  if (!client || !R2_PUBLIC_URL) {
    return { url: null, key: null };
  }

  const ext = opts.extension || '.jpg';
  const filename = opts.filename || crypto.randomUUID();
  const key = `${folder}/${filename}${ext}`;
  const mime = opts.contentType || MIME_TYPES[ext] || 'application/octet-stream';

  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mime,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;
  return { url, key };
}

module.exports = { uploadFromUrl, uploadBuffer };
