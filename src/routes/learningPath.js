import { Router } from 'express';
import Joi from 'joi';
import auth from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success } from '../utils/response.js';
import { getLearningPathStatus, completeTask } from '../services/learningPathService.js';

const router = Router();

const completeTaskSchema = Joi.object({
  task_id: Joi.string().uuid().required(),
  day: Joi.number().integer().min(1).max(30).required(),
});

router.get('/learning-path/status', auth, async (req, res, next) => {
  try {
    const data = await getLearningPathStatus(req.user.id);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

router.post('/learning-path/complete-task', auth, validate(completeTaskSchema), async (req, res, next) => {
  try {
    const { task_id, day } = req.body;
    const data = await completeTask(req.user.id, task_id, day);
    return success(res, data);
  } catch (err) {
    next(err);
  }
});

export default router;
