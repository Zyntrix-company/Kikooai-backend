import { Router } from 'express';
import Joi from 'joi';
import pool from '../db/pool.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import { jobQueue } from '../jobs/JobQueue.js';
import { transcriptionJobHandler } from '../jobs/transcriptionJob.js';

const router = Router();

const FORMAT_MIME = {
  webm: 'audio/webm',
  mp4:  'video/mp4',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  m4a:  'audio/mp4',
};

// ─── Validation schemas ────────────────────────────────────────────────────────

const uploadInitSchema = Joi.object({
  filename:         Joi.string().required(),
  duration_seconds: Joi.number().optional(),
  format:           Joi.string().valid('webm','mp4','mp3','wav','ogg','m4a').optional(),
  context_type:     Joi.string().valid('speaking','interview','speed_reading').default('speaking'),
});

const completeSchema = Joi.object({
  upload_id:           Joi.string().uuid().required(),
  cloudinary_public_id: Joi.string().required(),
  cloudinary_url:      Joi.string().uri().required(),
  duration_seconds:    Joi.number().optional(),
  format:              Joi.string().valid('webm','mp4','mp3','wav','ogg','m4a').optional(),
  prompt_text:         Joi.string().max(1000).optional().allow(''),
});

const evaluateSpeakingSchema = Joi.object({
  audio_id:  Joi.string().uuid().required(),
  prompt_id: Joi.string().uuid().required(),
});

// ─── POST /audio/upload-init ───────────────────────────────────────────────────

router.post('/audio/upload-init', auth, validate(uploadInitSchema), async (req, res, next) => {
  try {
    const { duration_seconds, format, context_type } = req.body;
    const userId = req.user.id;

    const cloudinaryData = await cloudinaryService.generateUploadSignature(userId, context_type);

    // Insert a placeholder row — public_id and url are filled in on /complete
    const { rows } = await pool.query(
      `INSERT INTO audio_files
         (user_id, cloudinary_public_id, cloudinary_url, duration_seconds, format, status, context_type)
       VALUES ($1, 'pending', 'pending', $2, $3, 'uploaded', $4)
       RETURNING id`,
      [userId, duration_seconds || null, format || null, context_type]
    );

    return success(res, {
      upload_id:  rows[0].id,
      cloudinary: {
        uploadUrl: cloudinaryData.uploadUrl,
        signature: cloudinaryData.signature,
        timestamp: cloudinaryData.timestamp,
        apiKey:    cloudinaryData.apiKey,
        cloudName: cloudinaryData.cloudName,
        folder:    cloudinaryData.folder,
      },
      expires_in_seconds: 900,
    });
  } catch (err) {
    if (err.code === 'CLOUDINARY_ERROR') {
      return fail(res, err.message, 'CLOUDINARY_ERROR', 400);
    }
    next(err);
  }
});

// ─── POST /audio/complete ──────────────────────────────────────────────────────

router.post('/audio/complete', auth, validate(completeSchema), async (req, res, next) => {
  try {
    const {
      upload_id,
      cloudinary_public_id,
      cloudinary_url,
      duration_seconds,
      format,
      prompt_text,
    } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const { rows: audioRows } = await pool.query(
      'SELECT * FROM audio_files WHERE id = $1 AND user_id = $2',
      [upload_id, userId]
    );
    if (!audioRows[0]) {
      return fail(res, 'Audio file not found', 'AUDIO_NOT_FOUND', 404);
    }

    // Verify the asset actually exists on Cloudinary
    let asset;
    try {
      asset = await cloudinaryService.verifyAndFetchAsset(cloudinary_public_id);
    } catch (err) {
      if (err.code === 'CLOUDINARY_ERROR') {
        return fail(res, err.message, 'CLOUDINARY_ERROR', 400);
      }
      throw err;
    }

    const resolvedFormat   = format || asset.format || null;
    const resolvedDuration = duration_seconds ?? asset.duration ?? null;
    const contextType      = audioRows[0].context_type;

    // Update the audio_files row
    await pool.query(
      `UPDATE audio_files
       SET cloudinary_public_id = $1,
           cloudinary_url       = $2,
           duration_seconds     = $3,
           format               = $4,
           status               = 'uploaded'
       WHERE id = $5`,
      [cloudinary_public_id, cloudinary_url, resolvedDuration, resolvedFormat, upload_id]
    );

    const mimeType = FORMAT_MIME[resolvedFormat] || 'audio/webm';

    // Enqueue transcription job
    const jobId = await jobQueue.enqueue(
      'transcription',
      {
        audioId:     upload_id,
        userId,
        publicId:    cloudinary_public_id,
        mimeType,
        contextType,
        promptText:  prompt_text || null,
      },
      transcriptionJobHandler,
      { userId }
    );

    return res.status(202).json({
      success: true,
      data: {
        audio_id: upload_id,
        job_id:   jobId,
        message:  'Transcription started. Poll /jobs/:job_id/status for progress.',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /jobs/:job_id/status ─────────────────────────────────────────────────

router.get('/jobs/:job_id/status', auth, async (req, res, next) => {
  try {
    const job = await jobQueue.getStatus(req.params.job_id);

    if (!job) {
      return fail(res, 'Job not found', 'JOB_NOT_FOUND', 404);
    }

    if (job.user_id !== req.user.id) {
      return fail(res, 'Job not found', 'JOB_NOT_FOUND', 404);
    }

    return success(res, {
      id:            job.id,
      status:        job.status,
      progress_pct:  job.progress_pct,
      error_message: job.error_message,
      updated_at:    job.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /audio/:audio_id/transcript ─────────────────────────────────────────

router.get('/audio/:audio_id/transcript', auth, async (req, res, next) => {
  try {
    const { audio_id } = req.params;
    const userId = req.user.id;

    const { rows: audioRows } = await pool.query(
      'SELECT * FROM audio_files WHERE id = $1 AND user_id = $2',
      [audio_id, userId]
    );
    if (!audioRows[0]) {
      return fail(res, 'Audio file not found', 'AUDIO_NOT_FOUND', 404);
    }

    const audio = audioRows[0];

    if (audio.status !== 'done') {
      return res.status(202).json({
        success: true,
        data: { status: audio.status, message: 'Transcription not complete yet' },
      });
    }

    const { rows: tRows } = await pool.query(
      'SELECT * FROM transcripts WHERE audio_id = $1 ORDER BY created_at DESC LIMIT 1',
      [audio_id]
    );

    return success(res, {
      audio_id,
      status: 'done',
      transcript: {
        id:             tRows[0].id,
        raw_text:       tRows[0].raw_text,
        asr_confidence: tRows[0].asr_confidence,
        feedback:       tRows[0].feedback_json,
        schema_version: tRows[0].schema_version,
        created_at:     tRows[0].created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /audio/:audio_id ──────────────────────────────────────────────────

router.delete('/audio/:audio_id', auth, async (req, res, next) => {
  try {
    const { audio_id } = req.params;
    const userId = req.user.id;

    const { rows } = await pool.query(
      'SELECT * FROM audio_files WHERE id = $1 AND user_id = $2',
      [audio_id, userId]
    );
    if (!rows[0]) {
      return fail(res, 'Audio file not found', 'AUDIO_NOT_FOUND', 404);
    }

    const publicId = rows[0].cloudinary_public_id;
    if (publicId && publicId !== 'pending') {
      try {
        await cloudinaryService.deleteAsset(publicId);
      } catch {
        // Best-effort deletion; proceed even if Cloudinary fails
      }
    }

    // Cascade deletes transcripts
    await pool.query('DELETE FROM audio_files WHERE id = $1', [audio_id]);

    return success(res, { message: 'Audio and transcript deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /audio ────────────────────────────────────────────────────────────────

router.get('/audio', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM audio_files WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    return success(res, { audio: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
