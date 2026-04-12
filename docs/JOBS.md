# Job Queue System

The Kikooai backend uses an **in-memory job queue** for all long-running background work (AI transcription, resume analysis, interview prep). This document explains how it works, how to monitor it, and the recommended upgrade path.

---

## How It Works

**File:** `src/jobs/JobQueue.js`

The queue is a singleton (`export const jobQueue`) created at module load time. It:

1. Keeps an in-memory array of job objects (`id`, `type`, `handler`, `payload`, `status`, `attempts`, `maxAttempts`).
2. Runs a `setInterval` every **2 seconds** (`TICK_INTERVAL_MS`) that picks the first `pending` job and runs it.
3. Persists state to the `jobs` table in PostgreSQL so clients can poll for progress.

### Lifecycle

```
enqueue()
  │
  ├─ INSERT INTO jobs (status='pending')  ← skipped if options.jobId provided
  └─ push to in-memory array
         │
         ▼ (next tick, ~0–2 s)
    status = 'processing'
    handler(payload, onProgress) runs
         │
    ┌────┴────────────────────────────────────────┐
    │ success                        │ error       │
    ▼                                ▼             │
  status = 'done'             attempts < maxAttempts?
  progress_pct = 100               │               │
  removed from memory            Yes              No
                                  │               │
                          exponential backoff    status = 'failed'
                          2^attempts seconds     error_message saved
                          then status='pending'  removed from memory
```

### Retry / Backoff

- Default `maxAttempts` = **3**.
- Delays: attempt 1 → 2 s, attempt 2 → 4 s, attempt 3 → permanent failure.
- On each retry the DB row stays `status='pending'` (so the client poll doesn't see an intermediate state).

### Progress Updates

Handlers receive an `onProgress(pct: number)` callback that writes `progress_pct` to the DB. Clients poll `GET /api/v1/jobs/:id` to read it.

---

## Job Types

| Type | Handler file | Trigger | Key payload fields |
|---|---|---|---|
| `transcription` | `src/jobs/transcriptionJob.js` | `POST /audio/upload-complete` | `audioId`, `userId`, `publicId`, `mimeType`, `contextType` |
| `resume_analysis` | `src/jobs/resumeJob.js` | `POST /resumes/analyze` | `reportId`, `resumeText`, `jdText`, `coverLetter`, `analysisType` |
| `resume_roast` | `src/jobs/resumeJob.js` | `POST /resumes/roast` | same as above, `analysisType='roast'` |
| `interview_prep` | `src/jobs/interviewJob.js` | `POST /interview/prep` | `sessionId`, `userId`, `resumeText`, `jdText` |

All handlers follow the same contract:

```js
async function handler(payload, onProgress) {
  // ...
  await onProgress(50);   // 0–100
  // ...
}
```

On failure they update the relevant domain table (e.g. `audio_files.status='failed'`, `resume_reports.status='failed'`) before re-throwing so the queue can record `error_message`.

---

## Monitoring

### Health check

`GET /healthz` returns `checks.job_queue.queued` — the number of jobs currently in the in-memory array.

```json
{
  "checks": {
    "job_queue": { "status": "ok", "queued": 2 }
  }
}
```

### Job logs (admin)

`GET /api/v1/admin/logs` — filterable by `status`, `type`, `user_id`, `from`/`to` date range. Returns paginated rows from the `jobs` table with `error_message` for failed jobs.

### Individual job status

`GET /api/v1/jobs/:id` — returns `{ status, progress_pct, error_message }` for any job. Accessible to the owning user or any admin.

---

## Retrying Failed Jobs (Admin)

`POST /api/v1/admin/jobs/:job_id/retry`

- Resets the DB row to `status='pending', attempts=0, error_message=null`.
- Re-enqueues the job with the original `payload_ref` (stored as JSONB in the `jobs` table).
- Uses `options.jobId` to skip a duplicate `INSERT`.

Supported types: `transcription`, `resume_analysis`, `resume_roast`, `interview_prep`.

---

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| **In-memory queue** | Jobs are lost on server restart / deploy | Render keeps uptime high; failed jobs can be retried via admin API |
| **Single-threaded tick** | Only one job runs at a time | Acceptable for current load; upgrade to Bull for concurrency |
| **No dead-letter queue** | After `maxAttempts` the job stays `failed` in DB only | Admin retry endpoint covers manual recovery |
| **No scheduled jobs** | Cron-style work (e.g. retention) uses `setInterval` in `index.js` | Works for single-instance; upgrade to cron package or Bull for multi-instance |

---

## Upgrade Path: Bull + Redis

The M2 spec calls for migrating to **Bull** (or **BullMQ**) backed by Redis for production scale.

**Steps:**

1. Add `bull` (or `bullmq`) and `ioredis` to `package.json`.
2. Add `REDIS_URL` to `.env` and `ENV.md`.
3. Replace `JobQueue` singleton with a Bull `Queue` instance; rename `enqueue()` to `queue.add()`.
4. Move tick logic to Bull processors: `queue.process('transcription', handler)`.
5. Keep the `jobs` table — update it from Bull event hooks (`job.on('progress')`, `job.on('completed')`, `job.on('failed')`).
6. Remove `setInterval`-based retention cron; add it as a Bull repeatable job.
7. Deploy a Redis instance (Render offers a managed Redis add-on).

The handler function signatures (`async (payload, onProgress) => void`) are already compatible — the migration is mostly a queue API swap.
