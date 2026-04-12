import app from './app.js';
import { archiveOldAudio } from './jobs/retentionJob.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);

  // ─── Audio retention cron ─────────────────────────────────────────────────
  // Run once 10s after startup (avoids hammering the DB at cold start), then every 24h.
  setTimeout(() => {
    archiveOldAudio().catch((err) => console.error('[retention] Startup run failed:', err?.message));
  }, 10_000);

  setInterval(() => {
    archiveOldAudio().catch((err) => console.error('[retention] Scheduled run failed:', err?.message));
  }, 24 * 60 * 60 * 1000).unref(); // .unref() so the interval won't prevent process exit
});

export default app;
