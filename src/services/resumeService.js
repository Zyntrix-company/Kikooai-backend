import pool from '../db/pool.js';
import * as cloudinaryService from './cloudinaryService.js';
import * as geminiService from './geminiService.js';
import { jobQueue } from '../jobs/JobQueue.js';
import { resumeJobHandler } from '../jobs/resumeJob.js';

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

export async function generateResumeUploadUrl(userId) {
  const cloudinary = await cloudinaryService.generateResumeUploadSignature(userId);

  const { rows } = await pool.query(
    `INSERT INTO resumes (user_id, title, cloudinary_public_id, cloudinary_url)
     VALUES ($1, 'Uploading...', 'pending', 'pending')
     RETURNING id`,
    [userId]
  );

  return {
    resume_id: rows[0].id,
    cloudinary: {
      uploadUrl:  cloudinary.uploadUrl,
      signature:  cloudinary.signature,
      timestamp:  cloudinary.timestamp,
      apiKey:     cloudinary.apiKey,
      cloudName:  cloudinary.cloudName,
      folder:     cloudinary.folder,
    },
  };
}

export async function completeResumeUpload(userId, resumeId, { publicId, url, format, title }) {
  const { rows } = await pool.query(
    'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
    [resumeId, userId]
  );
  if (!rows[0]) throw notFound('Resume not found', 'RESUME_NOT_FOUND');

  // Verify the asset actually exists on Cloudinary
  try {
    await cloudinaryService.verifyRawAsset(publicId);
  } catch (err) {
    if (err.code === 'FILE_NOT_FOUND_ON_CLOUDINARY') throw err;
    throw badRequest(err.message, 'FILE_NOT_FOUND_ON_CLOUDINARY');
  }

  const { rows: updated } = await pool.query(
    `UPDATE resumes
     SET cloudinary_public_id = $1,
         cloudinary_url       = $2,
         file_format          = $3,
         title                = COALESCE($4, title),
         updated_at           = now()
     WHERE id = $5
     RETURNING *`,
    [publicId, url, format, title || null, resumeId]
  );
  return updated[0];
}

export async function saveResumeJson(userId, { title, jsonBlob }) {
  const { rows } = await pool.query(
    `INSERT INTO resumes (user_id, title, json_blob)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, title || 'My Resume', JSON.stringify(jsonBlob)]
  );
  return rows[0];
}

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

export async function createReport(resumeId, userId, { jdText, coverLetter, analysisType }) {
  // Verify ownership
  const { rows: resumeRows } = await pool.query(
    'SELECT id FROM resumes WHERE id = $1 AND user_id = $2',
    [resumeId, userId]
  );
  if (!resumeRows[0]) throw notFound('Resume not found', 'RESUME_NOT_FOUND');

  const { text: resumeText } = await getResumeText(resumeId, userId);

  // Create the job row first so we have its id
  const { rows: jobRows } = await pool.query(
    `INSERT INTO jobs (type, status, user_id, payload_ref)
     VALUES ('resume_analyze', 'pending', $1, '{}')
     RETURNING id`,
    [userId]
  );
  const jobId = jobRows[0].id;

  // Create the report row referencing the job
  const { rows: reportRows } = await pool.query(
    `INSERT INTO resume_reports (resume_id, job_id, jd_text, cover_letter, analysis_type, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [resumeId, jobId, jdText, coverLetter || null, analysisType]
  );
  const reportId = reportRows[0].id;

  // Enqueue using the existing job row
  await jobQueue.enqueue(
    'resume_analyze',
    { reportId, resumeId, resumeText, jdText, coverLetter: coverLetter || null, analysisType },
    resumeJobHandler,
    { userId, jobId }
  );

  return { report_id: reportId, job_id: jobId };
}

export async function getReport(reportId, userId) {
  const { rows } = await pool.query(
    `SELECT rr.*
     FROM resume_reports rr
     JOIN resumes r ON r.id = rr.resume_id
     WHERE rr.id = $1 AND r.user_id = $2`,
    [reportId, userId]
  );
  if (!rows[0]) throw notFound('Report not found', 'REPORT_NOT_FOUND');
  return rows[0];
}

export async function listUserResumes(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return rows;
}
