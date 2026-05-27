import 'dotenv/config';
import express from 'express';
import pool from './db/pool.js';
import errorHandler from './middleware/errorHandler.js';
import { authLimiter, uploadLimiter, scoringLimiter, liveInterviewLimiter } from './middleware/rateLimiter.js';
import authRouter from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';
import audioRouter from './routes/audio.js';
import resumeRouter from './routes/resumes.js';
import interviewRouter from './routes/interview.js';
import jobsRouter from './routes/jobs.js';
import assignmentsRouter from './routes/assignments.js';
import gamesRouter from './routes/games.js';
import contestsRouter from './routes/contests.js';
import adminRouter from './routes/admin.js';
import learningPathRouter from './routes/learningPath.js';
import { jobQueue } from './jobs/JobQueue.js';
import { startEnergyResetJob } from './jobs/energyResetJob.js';

const app = express();

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting on sensitive endpoints ─────────────────────────────────────
app.use('/api/v1/auth/signup',         authLimiter);
app.use('/api/v1/auth/login',          authLimiter);
app.use('/api/v1/auth/google',         authLimiter);
app.use('/api/v1/audio/upload-init',   uploadLimiter);
app.use('/api/v1/resumes/upload-init', uploadLimiter);
app.use('/api/v1/exercises',           scoringLimiter);
app.use('/api/v1/games',               scoringLimiter);
app.use('/api/v1/interview/live/start', liveInterviewLimiter);

// Required env vars grouped by service
const REQUIRED_ENV = {
  core:       ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRY', 'REFRESH_TOKEN_EXPIRY'],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  gemini:     ['GEMINI_API_KEY'],
  google:     ['GOOGLE_CLIENT_ID'],
  livekit:    ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'],
};

// Health check — checks DB connectivity + env var completeness
app.get('/healthz', async (req, res) => {
  const ts = new Date().toISOString();
  const checks = {};
  let allOk = true;

  // 1. Database
  try {
    await pool.query('SELECT 1');
    checks.database = { status: 'ok' };
  } catch (err) {
    checks.database = { status: 'error', message: err.message };
    allOk = false;
  }

  // 2. Environment variables
  const envChecks = {};
  for (const [group, keys] of Object.entries(REQUIRED_ENV)) {
    const missing = keys.filter((k) => !process.env[k]);
    envChecks[group] = missing.length === 0
      ? { status: 'ok' }
      : { status: 'missing', missing };
    if (missing.length > 0) allOk = false;
  }
  checks.env = envChecks;

  // 3. Job queue
  checks.job_queue = { status: 'ok', queued: jobQueue.queue.length };

  // 4. Routes mounted
  checks.routes = {
    status: 'ok',
    mounted: [
      '/api/v1/auth', '/api/v1/exercises', '/api/v1/audio',
      '/api/v1/resumes', '/api/v1/interview', '/api/v1/jobs',
      '/api/v1/assignments', '/api/v1/games', '/api/v1/contests', '/api/v1/admin',
      '/api/v1/learning-path',
    ],
  };

  const httpStatus = allOk ? 200 : 503;
  return res.status(httpStatus).json({ status: allOk ? 'ok' : 'degraded', ts, checks });
});

// API routes
app.use('/api/v1', authRouter);
app.use('/api/v1', exercisesRouter);
app.use('/api/v1', audioRouter);
app.use('/api/v1', resumeRouter);
app.use('/api/v1', interviewRouter);
app.use('/api/v1', jobsRouter);
app.use('/api/v1', assignmentsRouter);
app.use('/api/v1', gamesRouter);
app.use('/api/v1', contestsRouter);
app.use('/api/v1', adminRouter);
app.use('/api/v1', learningPathRouter);

// Background jobs (skip in test — setTimeout keeps CI runners alive)
if (process.env.NODE_ENV !== 'test') {
  startEnergyResetJob();
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
