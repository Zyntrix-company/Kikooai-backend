import { Router } from 'express';
import Joi from 'joi';
import * as exerciseService from '../services/exerciseService.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';

const router = Router();

const ALLOWED_TYPES = [
  'fillup', 'jumbled_word', 'jumbled_sentence', 'vocab',
  'synonyms', 'antonyms', 'pronunciation_spelling',
  'grammar_transform', 'typing_from_audio',
];

const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];

const submitSchema = Joi.object({
  seed_id: Joi.string().uuid().required(),
  user_answer: Joi.any().required(),
  audio_id: Joi.string().uuid().optional(),
});

// GET /exercises/speaking/prompt  — must be declared before /:type routes
router.get('/exercises/speaking/prompt', auth, async (req, res, next) => {
  try {
    const prompt = await exerciseService.getSpeakingPrompt(req.user.id);
    if (!prompt) return fail(res, 'No speaking prompts available', 'NOT_FOUND', 404);
    return success(res, { prompt });
  } catch (err) {
    next(err);
  }
});

// GET /exercises/:type/seed
router.get('/exercises/:type/seed', auth, async (req, res, next) => {
  const { type } = req.params;
  const { difficulty = 'medium' } = req.query;

  if (!ALLOWED_TYPES.includes(type)) {
    return fail(res, 'Invalid exercise type', 'INVALID_TYPE', 400);
  }
  if (!ALLOWED_DIFFICULTIES.includes(difficulty)) {
    return fail(res, 'Invalid difficulty. Use easy, medium, or hard', 'INVALID_DIFFICULTY', 400);
  }

  try {
    const seed = await exerciseService.getExerciseSeed(type, difficulty);
    if (!seed) {
      return fail(res, 'No exercises available for this type and difficulty', 'NOT_FOUND', 404);
    }

    // Strip answer_key and acceptable_variants before sending to client
    // eslint-disable-next-line no-unused-vars
    const { answer_key, acceptable_variants, ...safePayload } = seed.payload;

    return success(res, {
      seed: { id: seed.id, type: seed.type, difficulty: seed.difficulty, payload: safePayload },
    });
  } catch (err) {
    next(err);
  }
});

// POST /exercises/:type/submit
router.post('/exercises/:type/submit', auth, validate(submitSchema), async (req, res, next) => {
  const { type } = req.params;

  if (!ALLOWED_TYPES.includes(type)) {
    return fail(res, 'Invalid exercise type', 'INVALID_TYPE', 400);
  }

  try {
    const { seed_id, user_answer } = req.body;
    const result = await exerciseService.submitExercise(req.user.id, seed_id, user_answer);
    return success(res, result);
  } catch (err) {
    if (err.code === 'ENERGY_DEPLETED') {
      return res.status(402).json({
        error: err.message,
        code: 'ENERGY_DEPLETED',
        resets_at: err.resets_at,
      });
    }
    next(err);
  }
});

export default router;
