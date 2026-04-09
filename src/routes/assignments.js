import { Router } from 'express';
import auth from '../middleware/auth.js';
import { success } from '../utils/response.js';
import * as assignmentService from '../services/assignmentService.js';

const router = Router();

// ─── GET /assignments/daily ───────────────────────────────────────────────────
// Returns the user's personalized daily exercise set based on their XP level.
// Includes progress (how many exercises they've completed today).

router.get('/assignments/daily', auth, async (req, res, next) => {
  try {
    const data = await assignmentService.getDailyAssignment(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
