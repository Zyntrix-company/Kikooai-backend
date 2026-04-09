import { Router } from 'express';
import Joi from 'joi';
import pool from '../db/pool.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import * as interviewService from '../services/interviewService.js';

const router = Router();

// ─── Validation schemas ──────────────────────────────────────────────────────

const saveReportSchema = Joi.object({
  transcript: Joi.array().items(
    Joi.object({ role: Joi.string().required(), text: Joi.string().required() })
  ).required(),
  report: Joi.object({
    score:               Joi.number().required(),
    feedback:            Joi.string().required(),
    strengths:           Joi.array().items(Joi.string()).required(),
    improvements:        Joi.array().items(Joi.string()).required(),
    technicalAccuracy:   Joi.string().optional().allow(''),
    communicationStyle:  Joi.string().optional().allow(''),
  }).required(),
});

const createRoomSchema = Joi.object({
  duration_mins:  Joi.number().min(1).max(120).optional(),
  question_count: Joi.number().min(1).max(20).optional(),
  difficulty:     Joi.string().valid('easy', 'medium', 'hard').optional(),
  job_role:       Joi.string().optional(),
  company:        Joi.string().optional(),
  questions:      Joi.array().items(
    Joi.object({ question_text: Joi.string().required() })
  ).max(20).optional(),
});

const stopRecordingSchema = Joi.object({
  audio_id: Joi.string().uuid().required(),
});

const evaluateSchema = Joi.object({
  question_text: Joi.string().min(10).required(),
  answer_text:   Joi.string().optional(),
  audio_id:      Joi.string().uuid().optional(),
  job_role:      Joi.string().optional(),
});

// ─── GET /interview/config ────────────────────────────────────────────────────
// Returns Gemini API key + voice map so the client can open a Gemini Live session.

router.get('/interview/config', auth, (req, res) => {
  return success(res, interviewService.getConfig());
});

// ─── GET /interview/questions ─────────────────────────────────────────────────
// Returns AI-generated questions for a role/round/difficulty (cached 1 hour).
// Query params: role (required), round (optional), difficulty (optional)

router.get('/interview/questions', auth, async (req, res, next) => {
  try {
    const { role, round = 'Technical', difficulty = 'Medium' } = req.query;
    if (!role) return fail(res, 'role query param is required', 'MISSING_ROLE', 400);

    const data = await interviewService.getInterviewQuestions(role, round, difficulty);
    return success(res, data);
  } catch (err) {
    if (err.code === 'AI_SERVICE_ERROR' || err.code === 'AI_PARSE_ERROR') {
      return fail(res, err.message, err.code, 502);
    }
    next(err);
  }
});

// ─── POST /interview/rooms/:room_id/save-report ───────────────────────────────
// Client calls this after the live session ends with the full transcript + report.

router.post('/interview/rooms/:room_id/save-report', auth, validate(saveReportSchema), async (req, res, next) => {
  try {
    const { transcript, report } = req.body;
    const result = await interviewService.saveReport(req.params.room_id, req.user.id, transcript, report);
    return success(res, result);
  } catch (err) {
    if (err.code === 'ROOM_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── POST /interview/rooms/create ─────────────────────────────────────────────

router.post('/interview/rooms/create', auth, validate(createRoomSchema), async (req, res, next) => {
  try {
    const result = await interviewService.createRoom(req.user.id, req.body);
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// ─── POST /interview/rooms/:room_id/record/start ──────────────────────────────

router.post('/interview/rooms/:room_id/record/start', auth, async (req, res, next) => {
  try {
    const result = await interviewService.startRecording(req.params.room_id, req.user.id);
    return success(res, result);
  } catch (err) {
    if (err.code === 'ROOM_NOT_FOUND')     return fail(res, err.message, err.code, 404);
    if (err.code === 'ROOM_ALREADY_ACTIVE') return fail(res, err.message, err.code, 400);
    next(err);
  }
});

// ─── POST /interview/rooms/:room_id/record/stop ───────────────────────────────

router.post('/interview/rooms/:room_id/record/stop', auth, validate(stopRecordingSchema), async (req, res, next) => {
  try {
    const result = await interviewService.stopRecording(
      req.params.room_id,
      req.user.id,
      req.body.audio_id
    );
    return res.status(202).json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'ROOM_NOT_FOUND')      return fail(res, err.message, err.code, 404);
    if (err.code === 'ROOM_NOT_RECORDING')  return fail(res, err.message, err.code, 400);
    if (err.code === 'AUDIO_NOT_FOUND')     return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── GET /interview/rooms/:room_id/result ─────────────────────────────────────

router.get('/interview/rooms/:room_id/result', auth, async (req, res, next) => {
  try {
    const result = await interviewService.getRoomResult(req.params.room_id, req.user.id);
    return success(res, result);
  } catch (err) {
    if (err.code === 'ROOM_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── GET /interview/rooms ─────────────────────────────────────────────────────

router.get('/interview/rooms', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM interview_rooms WHERE host_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    return success(res, { rooms: rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /interview/questions/evaluate ──────────────────────────────────────

router.post('/interview/questions/evaluate', auth, validate(evaluateSchema), async (req, res, next) => {
  try {
    const { question_text, answer_text, audio_id, job_role } = req.body;

    if (!answer_text && !audio_id) {
      return fail(res, 'Provide at least one of answer_text or audio_id', 'ANSWER_REQUIRED', 400);
    }

    const result = await interviewService.evaluateScrapedAnswer(req.user.id, {
      questionText: question_text,
      answerText:   answer_text,
      audioId:      audio_id,
      jobRole:      job_role,
    });

    // 202 if transcript not ready yet
    if (result.status === 202) {
      return res.status(202).json({ success: true, data: { message: result.message } });
    }

    return success(res, result);
  } catch (err) {
    if (err.code === 'ANSWER_REQUIRED') return fail(res, err.message, err.code, 400);
    next(err);
  }
});

export default router;
