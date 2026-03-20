import 'dotenv/config';
import express from 'express';
import pool from './db/pool.js';
import errorHandler from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    return res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// API routes
app.use('/api/v1', authRouter);
app.use('/api/v1', exercisesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// Global error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

export default app;
