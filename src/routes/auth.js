import { Router } from 'express';
import Joi from 'joi';
import * as authService from '../services/authService.js';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';

const router = Router();

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  fullname: Joi.string().required(),
  role: Joi.string().valid('student', 'job_seeker', 'professional').required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  interests: Joi.array().items(Joi.string()).optional(),
  education: Joi.object().optional(),
  motive: Joi.string().optional(),
  targets: Joi.object().optional(),
  resume_ref: Joi.string().uuid().allow(null).optional(),
});

// POST /auth/signup
router.post('/auth/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const user = await authService.createUser(req.body);
    const tokens = await authService.generateTokens(user);
    return success(res, { user, ...tokens }, 201);
  } catch (err) {
    if (err.code === '23505') {
      return fail(res, 'Email or username already in use', 'DUPLICATE_USER', 409);
    }
    next(err);
  }
});

// POST /auth/login
router.post('/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const user = await authService.loginUser(req.body);
    const tokens = await authService.generateTokens(user);
    return success(res, { user, ...tokens });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS' || err.code === 'ACCOUNT_BANNED') {
      return fail(res, err.message, err.code, err.status);
    }
    next(err);
  }
});

// POST /auth/refresh
router.post('/auth/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.rotateRefreshToken(req.body.refreshToken);
    return success(res, result);
  } catch (err) {
    if (err.code === 'INVALID_REFRESH_TOKEN') {
      return fail(res, err.message, err.code, 401);
    }
    next(err);
  }
});

// POST /auth/logout
router.post('/auth/logout', auth, async (req, res, next) => {
  try {
    await authService.logoutUser(req.user.id);
    return success(res, { message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// GET /users/me
router.get('/users/me', auth, async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.id);
    if (!user) return fail(res, 'User not found', 'USER_NOT_FOUND', 404);
    return success(res, { user });
  } catch (err) {
    next(err);
  }
});

// PATCH /users/me
router.patch('/users/me', auth, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const profile = await authService.updateUserProfile(req.user.id, req.body);
    return success(res, { profile });
  } catch (err) {
    next(err);
  }
});

export default router;
