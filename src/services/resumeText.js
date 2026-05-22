import pool from '../db/pool.js';
import * as cloudinaryService from './cloudinaryService.js';
import * as geminiService from './geminiService.js';

const MIME_BY_FORMAT = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt:  'text/plain',
};

function notFound(msg, code) {
  return Object.assign(new Error(msg), { status: 404, code });
}

function badRequest(msg, code) {
  return Object.assign(new Error(msg), { status: 400, code });
}

/**
 * Load plain-text resume content for analysis (JSON blob or Cloudinary file).
 */
export async function getResumeText(resumeId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM resumes WHERE id = $1 AND user_id = $2',
    [resumeId, userId]
  );
  if (!rows[0]) throw notFound('Resume not found', 'RESUME_NOT_FOUND');

  const resume = rows[0];

  if (resume.json_blob !== null) {
    return { text: JSON.stringify(resume.json_blob, null, 2), source: 'json' };
  }

  if (resume.cloudinary_public_id && resume.cloudinary_public_id !== 'pending') {
    const { buffer, format } = await cloudinaryService.downloadRawAsBuffer(resume.cloudinary_public_id);
    const mimeType = MIME_BY_FORMAT[format] || MIME_BY_FORMAT[resume.file_format] || 'application/pdf';
    const text     = await geminiService.extractResumeText(buffer, mimeType);
    return { text, source: 'file' };
  }

  throw badRequest('Resume has no content yet', 'RESUME_NO_CONTENT');
}
