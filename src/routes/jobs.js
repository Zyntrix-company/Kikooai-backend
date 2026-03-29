import { Router } from 'express';
import pool from '../db/pool.js';
import auth from '../middleware/auth.js';
import { success } from '../utils/response.js';

const router = Router();

// ─── GET /jobs ────────────────────────────────────────────────────────────────

router.get('/jobs', auth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, type, status, progress_pct, error_message, created_at, updated_at
       FROM jobs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    return success(res, { jobs: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
