import { Router } from 'express';
import Joi from 'joi';
import auth from '../middleware/auth.js';
import adminGuard from '../middleware/adminGuard.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import * as contestService from '../services/contestService.js';

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const createContestSchema = Joi.object({
  title:      Joi.string().min(3).max(120).required(),
  game_type:  Joi.string().required(),
  start_ts:   Joi.string().isoDate().optional().allow(null),
  end_ts:     Joi.string().isoDate().optional().allow(null),
  prize_info: Joi.object({
    prize_type: Joi.string().valid('pro', 'certificate', 'none').optional(),
    pro_days:   Joi.number().integer().min(1).optional(),
  }).optional(),
  settings: Joi.object({
    randomize_seed: Joi.boolean().optional(),
    pinned_seed_id: Joi.string().uuid().optional(),
  }).optional(),
});

const submitScoreSchema = Joi.object({
  score:    Joi.number().integer().min(0).required(),
  metadata: Joi.object().optional(),
});

// ─── POST /contests — create (admin only) ─────────────────────────────────────

router.post('/contests', auth, adminGuard, validate(createContestSchema), async (req, res, next) => {
  try {
    const contest = await contestService.createContest(req.user.id, req.body);
    return success(res, { contest }, 201);
  } catch (err) {
    next(err);
  }
});

// ─── GET /contests — list active contests ────────────────────────────────────

router.get('/contests', auth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || '20', 10), 50);
    const offset = parseInt(req.query.offset || '0', 10);
    const contests = await contestService.listActiveContests(limit, offset);
    return success(res, { contests });
  } catch (err) {
    next(err);
  }
});

// ─── POST /contests/:token/join ───────────────────────────────────────────────

router.post('/contests/:token/join', auth, async (req, res, next) => {
  try {
    const result = await contestService.joinContest(req.params.token, req.user.id);
    return success(res, result, 201);
  } catch (err) {
    if (err.code === 'CONTEST_NOT_FOUND')  return fail(res, err.message, err.code, 404);
    if (err.code === 'CONTEST_NOT_ACTIVE') return fail(res, err.message, err.code, 400);
    if (err.code === 'ALREADY_JOINED')     return fail(res, err.message, err.code, 409);
    next(err);
  }
});

// ─── GET /contests/:token/leaderboard ────────────────────────────────────────

router.get('/contests/:token/leaderboard', auth, async (req, res, next) => {
  try {
    const result = await contestService.getLeaderboard(req.params.token, req.user.id);
    return success(res, result);
  } catch (err) {
    if (err.code === 'CONTEST_NOT_FOUND') return fail(res, err.message, err.code, 404);
    next(err);
  }
});

// ─── POST /contests/:token/score ─────────────────────────────────────────────

router.post('/contests/:token/score', auth, validate(submitScoreSchema), async (req, res, next) => {
  try {
    const { score, metadata } = req.body;
    const result = await contestService.submitScore(req.params.token, req.user.id, score, metadata);
    return success(res, result);
  } catch (err) {
    if (err.code === 'CONTEST_NOT_FOUND')  return fail(res, err.message, err.code, 404);
    if (err.code === 'CONTEST_NOT_ACTIVE') return fail(res, err.message, err.code, 400);
    if (err.code === 'NOT_A_PARTICIPANT')  return fail(res, err.message, err.code, 403);
    next(err);
  }
});

// ─── POST /contests/:token/complete — finalize (admin only) ──────────────────

router.post('/contests/:token/complete', auth, adminGuard, async (req, res, next) => {
  try {
    const result = await contestService.completeContest(req.params.token, req.user.id);
    return success(res, result);
  } catch (err) {
    if (err.code === 'CONTEST_NOT_FOUND')  return fail(res, err.message, err.code, 404);
    if (err.code === 'ALREADY_COMPLETED')  return fail(res, err.message, err.code, 400);
    next(err);
  }
});

export default router;
