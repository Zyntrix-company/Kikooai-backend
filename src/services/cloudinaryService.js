import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const AUDIO_FOLDER = process.env.CLOUDINARY_AUDIO_FOLDER || 'kikoo/audio';
const cloudName   = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey      = process.env.CLOUDINARY_API_KEY;
const IS_TEST     = process.env.NODE_ENV === 'test';

function cloudinaryTestError(message, code = 'CLOUDINARY_ERROR', status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

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
  if (IS_TEST) {
    throw cloudinaryTestError('Asset not found on Cloudinary');
  }
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
  if (IS_TEST) {
    throw cloudinaryTestError('Asset not found on Cloudinary');
  }
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
  if (IS_TEST) return { result: 'ok' };
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
  if (IS_TEST) {
    throw cloudinaryTestError('Raw asset not found on Cloudinary', 'FILE_NOT_FOUND_ON_CLOUDINARY');
  }
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
 * Upload a Buffer directly to Cloudinary as a raw asset (server-side).
 * Used for exports and other server-generated files.
 * @param {Buffer} buffer
 * @param {string} publicId  e.g. 'kikoo/exports/my-file'
 * @param {string} [mimeType]  e.g. 'text/csv'
 * @returns {{ secureUrl: string, publicId: string }}
 */
export async function uploadBufferAsRaw(buffer, publicId, mimeType = 'text/csv') {
  if (IS_TEST) {
    return {
      secureUrl: `https://ci.example/${publicId}`,
      publicId,
    };
  }
  const b64    = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${b64}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: 'raw',
      public_id:     publicId,
      overwrite:     true,
    });
    return { secureUrl: result.secure_url, publicId: result.public_id };
  } catch (err) {
    const e  = new Error(err?.message || 'Failed to upload file to Cloudinary');
    e.code   = 'CLOUDINARY_ERROR';
    e.status = 500;
    throw e;
  }
}

/**
 * Delete all Cloudinary assets belonging to a user (GDPR erasure).
 * Audio files are stored as 'video' resource type; resumes as 'raw'.
 * Best-effort: errors are logged but not re-thrown.
 * @param {string} userId
 */
export async function deleteUserAssets(userId) {
  if (IS_TEST) return {};
  const results = {};
  try {
    results.audio = await cloudinary.api.delete_resources_by_prefix(
      `kikoo/audio/${userId}`,
      { resource_type: 'video' }
    );
  } catch (err) {
    console.error(`[cloudinary] Failed to delete audio for user ${userId}:`, err?.message);
  }
  try {
    results.resumes = await cloudinary.api.delete_resources_by_prefix(
      `kikoo/resumes/${userId}`,
      { resource_type: 'raw' }
    );
  } catch (err) {
    console.error(`[cloudinary] Failed to delete resumes for user ${userId}:`, err?.message);
  }
  return results;
}

/**
 * Download a Cloudinary raw asset (resume file) as a Buffer.
 * Uses private_download_url so the download is authenticated even when the
 * Cloudinary account restricts direct CDN delivery of raw assets.
 * @param {string} publicId
 * @returns {{ buffer: Buffer, format: string }}
 */
export async function downloadRawAsBuffer(publicId) {
  if (IS_TEST) {
    throw cloudinaryTestError('Raw asset not found on Cloudinary', 'CLOUDINARY_RAW_DOWNLOAD_FAILED');
  }
  const asset = await verifyRawAsset(publicId);

  // private_download_url produces an API-gateway URL signed with api_key + secret,
  // so it works regardless of CDN access-control settings on the account.
  const downloadUrl = cloudinary.utils.private_download_url(publicId, asset.format, {
    resource_type: 'raw',
  });

  const res = await fetch(downloadUrl);
  if (res.ok) {
    const arrayBuf = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuf), format: asset.format };
  }

  // Some accounts deliver raw bytes on secure_url even when the private URL path misbehaves.
  if (asset.secureUrl) {
    const fallback = await fetch(asset.secureUrl);
    if (fallback.ok) {
      const arrayBuf = await fallback.arrayBuffer();
      return { buffer: Buffer.from(arrayBuf), format: asset.format };
    }
  }

  const e = new Error(
    `Failed to download raw asset (private URL HTTP ${res.status} ${res.statusText}; public_id=${publicId}; format=${asset.format})`
  );
  e.code   = 'CLOUDINARY_RAW_DOWNLOAD_FAILED';
  e.status = 400;
  throw e;
}

/**
 * Generate a short-lived signed URL so a client can view or download a resume file.
 * @param {string} publicId
 * @param {string} format  e.g. 'pdf'
 * @param {number} [ttlSeconds]  Default 600 (10 min)
 * @returns {string}
 */
export function getResumeFileUrl(publicId, format, ttlSeconds = 600) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: 'raw',
    expires_at:    expiresAt,
  });
}
