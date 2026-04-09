import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AUDIO_FOLDER = process.env.CLOUDINARY_AUDIO_FOLDER || 'kikoo/audio';
const cloudName   = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey      = process.env.CLOUDINARY_API_KEY;

/**
 * Generate a signed upload signature so the client can upload directly to Cloudinary.
 * @param {string} userId
 * @param {string} contextType
 */
export async function generateUploadSignature(userId, contextType) {
  const timestamp = Math.round(Date.now() / 1000);
  const folder    = `${AUDIO_FOLDER}/${userId}`;
  const tags      = `user_${userId},${contextType}`;

  // Only sign params the client will actually include in the upload request.
  // resource_type goes in the URL (not the form body), so it must NOT be signed.
  // tags would need to be sent by the client too — omit to keep the contract simple.
  const paramsToSign = { folder, timestamp };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    signature,
    timestamp,
    cloudName,
    apiKey,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
  };
}

/**
 * Verify an asset exists on Cloudinary and return its metadata.
 * @param {string} publicId
 */
export async function verifyAndFetchAsset(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
    return {
      publicId:  result.public_id,
      secureUrl: result.secure_url,
      duration:  result.duration,
      format:    result.format,
      bytes:     result.bytes,
    };
  } catch (err) {
    const msg = err?.error?.message || err?.message || 'Asset not found on Cloudinary';
    const e   = new Error(msg);
    e.code    = 'CLOUDINARY_ERROR';
    e.status  = 400;
    throw e;
  }
}

/**
 * Download a Cloudinary audio asset as a Buffer.
 * @param {string} publicId
 * @returns {{ buffer: Buffer, format: string }}
 */
export async function downloadAsBuffer(publicId) {
  const asset = await verifyAndFetchAsset(publicId);
  const res   = await fetch(asset.secureUrl);
  if (!res.ok) {
    const e  = new Error(`Failed to download asset: ${res.statusText}`);
    e.code   = 'CLOUDINARY_ERROR';
    e.status = 400;
    throw e;
  }
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), format: asset.format };
}

/**
 * Delete an asset from Cloudinary (GDPR deletion).
 * @param {string} publicId
 * @param {'video'|'raw'|'image'} resourceType
 */
export async function deleteAsset(publicId, resourceType = 'video') {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Generate a signed upload signature for resume files (PDF/DOCX/TXT).
 * @param {string} userId
 */
export async function generateResumeUploadSignature(userId) {
  const timestamp = Math.round(Date.now() / 1000);
  const folder    = `kikoo/resumes/${userId}`;
  const tags      = `user_${userId},resume`;

  // Only sign params the client will actually send in the upload request.
  const paramsToSign = { folder, timestamp };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return {
    signature,
    timestamp,
    cloudName,
    apiKey,
    folder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
  };
}

/**
 * Verify a raw (PDF/DOCX/TXT) asset exists on Cloudinary.
 * @param {string} publicId
 */
export async function verifyRawAsset(publicId) {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'raw' });
    return {
      publicId:  result.public_id,
      secureUrl: result.secure_url,
      format:    result.format,
      bytes:     result.bytes,
    };
  } catch (err) {
    const msg = err?.error?.message || err?.message || 'Raw asset not found on Cloudinary';
    const e   = new Error(msg);
    e.code    = 'FILE_NOT_FOUND_ON_CLOUDINARY';
    e.status  = 400;
    throw e;
  }
}

/**
 * Download a Cloudinary raw asset (resume file) as a Buffer.
 * @param {string} publicId
 * @returns {{ buffer: Buffer, format: string }}
 */
export async function downloadRawAsBuffer(publicId) {
  const asset = await verifyRawAsset(publicId);
  const res   = await fetch(asset.secureUrl);
  if (!res.ok) {
    const e  = new Error(`Failed to download raw asset: ${res.statusText}`);
    e.code   = 'FILE_NOT_FOUND_ON_CLOUDINARY';
    e.status = 400;
    throw e;
  }
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), format: asset.format };
}
