import { Router } from 'express';
import Joi from 'joi';
import * as gameService from '../services/gameService.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';

const router = Router();

const ALLOWED_TYPES = ['conexo', 'speed_reading', 'contextooo', 'word_blitz', 'guess_the_word'];

const contextoooRankSchema = Joi.object({
  seedId: Joi.string().uuid().required(),
  guess:  Joi.string().trim().min(1).max(100).required(),
});

const scoreSchema = Joi.object({
  game_id: Joi.string().uuid().required(),
  score: Joi.number().integer().required(),
  combo: Joi.number().integer().optional(),
  hearts_left: Joi.number().integer().optional(),
  time_taken_seconds: Joi.number().integer().optional(),
  metadata: Joi.object().optional(),
});

// POST /games/contextooo/rank
router.post('/games/contextooo/rank', auth, validate(contextoooRankSchema), async (req, res, next) => {
  try {
    const { seedId, guess } = req.body;
    const result = await gameService.rankContextoooGuess(seedId, guess);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /games/:type/seed
router.get('/games/:type/seed', auth, async (req, res, next) => {
  const { type } = req.params;

  if (!ALLOWED_TYPES.includes(type)) {
    return fail(res, 'Invalid game type', 'INVALID_TYPE', 400);
  }

  try {
    const game = await gameService.getGameSeed(type);
    if (!game) {
      return fail(res, 'No games available for this type', 'NOT_FOUND', 404);
    }

    // Strip answer_key before sending to client
    // eslint-disable-next-line no-unused-vars
    const { answer_key, ...safeSeedJson } = game.seed_json;

    return success(res, {
      game: {
        id: game.id,
        type: game.type,
        difficulty: game.difficulty,
        config: game.config,
        seed_json: safeSeedJson,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /games/:type/score
router.post('/games/:type/score', auth, validate(scoreSchema), async (req, res, next) => {
  const { type } = req.params;

  if (!ALLOWED_TYPES.includes(type)) {
    return fail(res, 'Invalid game type', 'INVALID_TYPE', 400);
  }

  try {
    const result = await gameService.submitScore(req.user.id, req.body.game_id, req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;
