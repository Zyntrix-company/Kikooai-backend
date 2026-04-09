import { Router } from 'express';
import Joi from 'joi';
import pool from '../db/pool.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import * as cloudinaryService from '../services/cloudinaryService.js';
import * as resumeService from '../services/resumeService.js';

const router = Router();

// ─── Validation schemas ──────────────────────────────────────────────────────

const completeUploadSchema = Joi.object({
  resume_id:            Joi.string().uuid().required(),
  cloudinary_public_id: Joi.string().required(),
  cloudinary_url:       Joi.string().uri().required(),
  format:               Joi.string().valid('pdf', 'docx', 'txt').required(),
  title:                Joi.string().max(100).optional(),
});

const saveJsonSchema = Joi.object({
  title:     Joi.string().optional(),
  json_blob: Joi.object().required(),
});

const analyzeSchema = Joi.object({
  resume_id:    Joi.string().uuid().required(),
  jd_text:      Joi.string().min(50).required(),
  cover_letter: Joi.string().optional().allow(''),
});

// ─── POST /resumes/upload-init ────────────────────────────────────────────────

router.post('/resumes/upload-init', auth, async (req, res, next) => {
  try {
    const result = await resumeService.generateResumeUploadUrl(req.user.id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /resumes/upload-complete ───────────────────────────────────────────

router.post('/resumes/upload-complete', auth, validate(completeUploadSchema), async (req, res, next) => {
  try {
    const { resume_id, cloudinary_public_id, cloudinary_url, format, title } = req.body;
    const resume = await resumeService.completeResumeUpload(req.user.id, resume_id, {
      publicId: cloudinary_public_id,
      url:      cloudinary_url,
      format,
      title,
    });
    return success(res, { resume });
  } catch (err) {
    if (err.code === 'RESUME_NOT_FOUND')           return fail(res, err.message, err.code, 404);
    if (err.code === 'FILE_NOT_FOUND_ON_CLOUDINARY') return fail(res, err.message, err.code, 400);
    next(err);
  }
});

// ─── POST /resumes/save-json ──────────────────────────────────────────────────

router.post('/resumes/save-json', auth, validate(saveJsonSchema), async (req, res, next) => {
  try {
    const resume = await resumeService.saveResumeJson(req.user.id, {
      title:    req.body.title,
      jsonBlob: req.body.json_blob,
    });
    return success(res, { resume }, 201);
  } catch (err) {
    next(err);
  }
});

// ─── POST /resumes/analyze ────────────────────────────────────────────────────

router.post('/resumes/analyze', auth, validate(analyzeSchema), async (req, res, next) => {
  try {
    const { resume_id, jd_text, cover_letter } = req.body;
    if (jd_text.length < 50) {
      return fail(res, 'Job description must be at least 50 characters', 'JD_TOO_SHORT', 400);
    }
    const result = await resumeService.createReport(resume_id, req.user.id, {
      jdText:       jd_text,
      coverLetter:  cover_letter || null,
      analysisType: 'analyze',
    });
    return res.status(202).json({
      success: true,
      data: { ...result, message: 'Analysis started. Poll /resumes/reports/:report_id for results.' },
    });
  } catch (err) {
    if (err.code === 'RESUME_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── POST /resumes/roast ──────────────────────────────────────────────────────

router.post('/resumes/roast', auth, validate(analyzeSchema), async (req, res, next) => {
  try {
    const { resume_id, jd_text, cover_letter } = req.body;
    if (jd_text.length < 50) {
      return fail(res, 'Job description must be at least 50 characters', 'JD_TOO_SHORT', 400);
    }
    const result = await resumeService.createReport(resume_id, req.user.id, {
      jdText:       jd_text,
      coverLetter:  cover_letter || null,
      analysisType: 'roast',
    });
    return res.status(202).json({
      success: true,
      data: { ...result, message: 'Roast started. Poll /resumes/reports/:report_id for results.' },
    });
  } catch (err) {
    if (err.code === 'RESUME_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── GET /resumes/reports/:report_id ─────────────────────────────────────────

router.get('/resumes/reports/:report_id', auth, async (req, res, next) => {
  try {
    const report = await resumeService.getReport(req.params.report_id, req.user.id);

    if (report.status === 'failed') {
      return fail(res, 'Analysis failed', 'ANALYSIS_FAILED', 500);
    }

    if (report.status !== 'done') {
      return res.status(202).json({
        success: true,
        data: { status: report.status, report: null, message: 'Analysis in progress' },
      });
    }

    return success(res, {
      status:        report.status,
      report:        report.report_json,
      score:         report.score,
      analysis_type: report.analysis_type,
      created_at:    report.created_at,
    });
  } catch (err) {
    if (err.code === 'REPORT_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── GET /resumes ─────────────────────────────────────────────────────────────

router.get('/resumes', auth, async (req, res, next) => {
  try {
    const resumes = await resumeService.listUserResumes(req.user.id);
    return success(res, { resumes });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /resumes/:resume_id ───────────────────────────────────────────────

router.delete('/resumes/:resume_id', auth, async (req, res, next) => {
  try {
    const { resume_id } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM resumes WHERE id = $1 AND user_id = $2',
      [resume_id, req.user.id]
    );
    if (!rows[0]) return fail(res, 'Resume not found', 'RESUME_NOT_FOUND', 404);

    const publicId = rows[0].cloudinary_public_id;
    if (publicId && publicId !== 'pending') {
      try {
        await cloudinaryService.deleteAsset(publicId, 'raw');
      } catch {
        // Best-effort; proceed even if Cloudinary fails
      }
    }

    await pool.query('DELETE FROM resumes WHERE id = $1', [resume_id]);
    return success(res, { message: 'Resume deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
