import { Router } from 'express';
import Joi from 'joi';
import auth from '../middleware/auth.js';
import adminGuard from '../middleware/adminGuard.js';
import { validate } from '../middleware/validate.js';
import { success, fail } from '../utils/response.js';
import * as adminService from '../services/adminService.js';

const router = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const banSchema = Joi.object({
  reason: Joi.string().max(500).optional().allow(''),
});

const flagSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

const assignBadgeSchema = Joi.object({
  badge_id:   Joi.string().required(),
  badge_name: Joi.string().required(),
});

const removeBadgeSchema = Joi.object({
  badge_id: Joi.string().required(),
});

const grantProSchema = Joi.object({
  days: Joi.number().integer().min(1).max(3650).required(),
});

const createPromoSchema = Joi.object({
  code:         Joi.string().alphanum().min(3).max(30).required(),
  discount_pct: Joi.number().integer().min(0).max(100).required(),
  max_uses:     Joi.number().integer().min(1).optional(),
  grants_pro:   Joi.boolean().optional(),
  pro_days:     Joi.number().integer().min(1).optional(),
  expires_at:   Joi.string().isoDate().optional().allow(null),
});

const redeemSchema = Joi.object({
  code: Joi.string().required(),
});

// ─── Helper: resolve 404/400/409 service errors to correct HTTP codes ─────────

function handleAdminError(err, res, next) {
  if (err.status === 404) return fail(res, err.message, err.code, 404);
  if (err.status === 409) return fail(res, err.message, err.code, 409);
  if (err.status === 400) return fail(res, err.message, err.code, 400);
  next(err);
}

// ─── User management ─────────────────────────────────────────────────────────

// GET /admin/users
router.get('/admin/users', auth, adminGuard, async (req, res, next) => {
  try {
    const { search, limit, offset } = req.query;
    const result = await adminService.listUsers({ search, limit, offset });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /admin/users/:id
router.get('/admin/users/:id', auth, adminGuard, async (req, res, next) => {
  try {
    const user = await adminService.getUserDetail(req.params.id);
    return success(res, { user });
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// POST /admin/users/:id/ban
router.post('/admin/users/:id/ban', auth, adminGuard, validate(banSchema), async (req, res, next) => {
  try {
    const result = await adminService.banUser(req.user.id, req.params.id, req.body.reason);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// POST /admin/users/:id/unban
router.post('/admin/users/:id/unban', auth, adminGuard, async (req, res, next) => {
  try {
    const result = await adminService.unbanUser(req.user.id, req.params.id);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// POST /admin/users/:id/flag
router.post('/admin/users/:id/flag', auth, adminGuard, validate(flagSchema), async (req, res, next) => {
  try {
    const result = await adminService.flagUser(req.user.id, req.params.id, req.body.reason);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// DELETE /admin/users/:id
router.delete('/admin/users/:id', auth, adminGuard, async (req, res, next) => {
  try {
    const result = await adminService.deleteUser(req.user.id, req.params.id);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// ─── Badge management ─────────────────────────────────────────────────────────

// POST /admin/users/:id/badges/assign
router.post('/admin/users/:id/badges/assign', auth, adminGuard, validate(assignBadgeSchema), async (req, res, next) => {
  try {
    const { badge_id, badge_name } = req.body;
    const result = await adminService.assignBadge(req.user.id, req.params.id, badge_id, badge_name);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// POST /admin/users/:id/badges/remove
router.post('/admin/users/:id/badges/remove', auth, adminGuard, validate(removeBadgeSchema), async (req, res, next) => {
  try {
    const result = await adminService.removeBadge(req.user.id, req.params.id, req.body.badge_id);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// ─── Pro subscription ─────────────────────────────────────────────────────────

// POST /admin/users/:id/grant-pro
router.post('/admin/users/:id/grant-pro', auth, adminGuard, validate(grantProSchema), async (req, res, next) => {
  try {
    const result = await adminService.grantPro(req.user.id, req.params.id, req.body.days);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// POST /admin/users/:id/revoke-pro
router.post('/admin/users/:id/revoke-pro', auth, adminGuard, async (req, res, next) => {
  try {
    const result = await adminService.revokePro(req.user.id, req.params.id);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// ─── Promo codes (admin CRUD) ─────────────────────────────────────────────────

// POST /admin/promo-codes
router.post('/admin/promo-codes', auth, adminGuard, validate(createPromoSchema), async (req, res, next) => {
  try {
    const promo = await adminService.createPromoCode(req.user.id, req.body);
    return success(res, { promo }, 201);
  } catch (err) {
    if (err.code === '23505') return fail(res, 'Promo code already exists', 'PROMO_DUPLICATE', 409);
    next(err);
  }
});

// GET /admin/promo-codes
router.get('/admin/promo-codes', auth, adminGuard, async (req, res, next) => {
  try {
    const promos = await adminService.listPromoCodes();
    return success(res, { promos });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/promo-codes/:id
router.patch('/admin/promo-codes/:id', auth, adminGuard, async (req, res, next) => {
  try {
    const promo = await adminService.togglePromoCode(req.user.id, req.params.id);
    return success(res, { promo });
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// ─── Logs ─────────────────────────────────────────────────────────────────────

// GET /admin/logs
router.get('/admin/logs', auth, adminGuard, async (req, res, next) => {
  try {
    const { status, type, limit, offset } = req.query;
    const result = await adminService.getLogs({ status, type, limit, offset });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

// ─── Job retry ────────────────────────────────────────────────────────────────

// POST /admin/jobs/:job_id/retry
router.post('/admin/jobs/:job_id/retry', auth, adminGuard, async (req, res, next) => {
  try {
    const result = await adminService.retryJob(req.user.id, req.params.job_id);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// ─── Exports ──────────────────────────────────────────────────────────────────

const exportSchema = Joi.object({
  export_type: Joi.string().valid('users', 'transcripts', 'contest_results', 'game_scores').required(),
});

// POST /admin/export
router.post('/admin/export', auth, adminGuard, validate(exportSchema), async (req, res, next) => {
  try {
    const result = await adminService.triggerExport(req.user.id, req.body.export_type);
    return success(res, result, 202);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

// GET /admin/exports
router.get('/admin/exports', auth, adminGuard, async (req, res, next) => {
  try {
    const exports = await adminService.listExports();
    return success(res, { exports });
  } catch (err) {
    next(err);
  }
});

// ─── Promo code redeem (auth only — NOT admin-only) ───────────────────────────

// POST /promo-codes/redeem
router.post('/promo-codes/redeem', auth, validate(redeemSchema), async (req, res, next) => {
  try {
    const result = await adminService.redeemPromoCode(req.user.id, req.body.code);
    return success(res, result);
  } catch (err) {
    handleAdminError(err, res, next);
  }
});

export default router;
