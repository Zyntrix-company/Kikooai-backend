# KikooAI Backend

Production-ready REST API for **KikooAI** — an AI-powered English learning + interview prep platform.

Features: text exercises, XP progression, streaks, direct audio upload, real-time transcription via Gemini AI, structured speaking feedback, and an in-process job queue — all on a serverless Postgres database.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express.js v5 |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| Auth | JWT (15m access token) + UUID refresh tokens (bcrypt-hashed) |
| Validation | Joi |
| Audio storage | Cloudinary v2 (client uploads directly — no proxy) |
| AI / Transcription | Google Gemini (`@google/generative-ai`) |
| Background jobs | In-process `JobQueue` (setInterval, no Redis/Bull) |

---

## Project Structure

```
src/
├── db/
│   ├── pool.js              # Singleton pg connection pool (Neon)
│   └── migrate.js           # SQL migration runner (tracks applied files)
├── jobs/
│   ├── JobQueue.js          # Lightweight in-process job queue (singleton)
│   └── transcriptionJob.js  # Transcription job handler (Cloudinary → Gemini → DB)
├── middleware/
│   ├── auth.js              # JWT Bearer verification → req.user
│   ├── adminGuard.js        # is_admin check (runs after auth)
│   ├── errorHandler.js      # Global 4-arg Express error handler
│   └── validate.js          # Joi request body validator factory
├── migrations/
│   ├── 001_users.sql        # users table
│   ├── 002_profiles.sql     # profiles + refresh_tokens
│   ├── 003_exercises.sql    # exercise_seeds + exercise_submissions
│   └── 004_audio.sql        # audio_files + transcripts + jobs
├── routes/
│   ├── auth.js              # /auth/* and /users/me
│   ├── exercises.js         # /exercises/* (including speaking/evaluate)
│   └── audio.js             # /audio/* and /jobs/:id/status
├── services/
│   ├── authService.js       # Auth DB logic (signup, login, refresh, profile)
│   ├── exerciseService.js   # Exercise + energy + streak + speaking evaluation
│   ├── cloudinaryService.js # Signed upload, asset verify, download, delete
│   └── geminiService.js     # Transcribe audio, analyse transcript, compare texts
├── seeds/
│   └── exercises.js         # Sample exercise data (idempotent)
├── utils/
│   ├── cloudinary.js        # Pre-configured Cloudinary v2 instance (legacy util)
│   ├── gemini.js            # Gemini model factory (legacy util)
│   ├── response.js          # success() / fail() response helpers
│   └── sanitize.js          # sanitizeUser() — strips password_hash
└── index.js                 # Entry point — mounts all routers, starts JobQueue
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the required values. See [Environment Variables](#environment-variables).

### 3. Run migrations

```bash
npm run migrate
```

Migrations are tracked in a `migrations_run` table — each file runs in a transaction and is skipped if already applied.

### 4. Seed exercise data (optional)

```bash
node src/seeds/exercises.js
```

Inserts 9 sample exercises (3 × fillup, jumbled_word, vocab). Idempotent — safe to re-run.

### 5. Start the server

```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server starts on `PORT` (default `3000`). The `JobQueue` ticker starts automatically on import.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing access tokens |
| `JWT_EXPIRY` | ✅ | Access token TTL (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRY` | ✅ | Refresh token TTL (e.g. `30d`) |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |
| `CLOUDINARY_AUDIO_FOLDER` | — | Upload folder prefix (default: `kikoo/audio`) |
| `GEMINI_API_KEY` | ✅ | Google AI Studio API key |
| `GEMINI_MODEL` | — | Gemini model ID (default: `gemini-1.5-flash`) |
| `AI_API_KEY` | — | Alias for `GEMINI_API_KEY` (legacy, still works) |
| `ADMIN_SECRET` | ✅ | Secret for admin operations |
| `ENERGY_PER_MINUTE` | — | Energy rate (default: `1`) |
| `MIN_DAILY_ENERGY_FOR_STREAK` | — | Exercises needed for streak (default: `10`) |
| `AUDIO_ARCHIVE_AFTER_DAYS` | — | Days before audio archival (default: `90`) |
| `PORT` | — | Server port (default: `3000`) |
| `NODE_ENV` | — | `development` or `production` |

---

## API Reference

**Base URL:** `http://localhost:3000`
**Auth:** `Authorization: Bearer <accessToken>` (🔒 = required)

All responses follow this envelope:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

---

### Health

#### `GET /healthz`

No auth required.

```json
{ "status": "ok", "db": "connected", "ts": "2026-03-25T08:00:00.000Z" }
```

---

### Auth

#### `POST /api/v1/auth/signup`

| Field | Rules |
|---|---|
| `email` | Valid email, unique |
| `password` | Min 8 chars |
| `username` | Alphanumeric, 3–30 chars, unique |
| `fullname` | String, required |
| `role` | `student` · `job_seeker` · `professional` |

**201** → `{ user, accessToken, refreshToken }`
**Errors:** `409 DUPLICATE_USER` · `400 VALIDATION_ERROR`

---

#### `POST /api/v1/auth/login`

```json
{ "email": "user@kikoo.ai", "password": "password123" }
```

**200** → same shape as signup.
**Errors:** `401 INVALID_CREDENTIALS` · `403 ACCOUNT_BANNED`

---

#### `POST /api/v1/auth/refresh`

```json
{ "refreshToken": "uuid-v4" }
```

**200** → `{ accessToken, refreshToken, user }` — old token invalidated.
**Error:** `401 INVALID_REFRESH_TOKEN`

---

#### `POST /api/v1/auth/logout` 🔒

Invalidates all refresh tokens for the user.
**200** → `{ message: "Logged out" }`

---

### User

#### `GET /api/v1/users/me` 🔒

Returns the authenticated user + full profile (XP, streak, badges, subscription).

#### `PATCH /api/v1/users/me` 🔒

Update any subset of: `interests`, `education`, `motive`, `targets`, `resume_ref`.

---

### Exercises

All exercise routes require authentication.

#### Exercise Types

| Type | Description |
|---|---|
| `fillup` | Fill in the blank |
| `jumbled_word` | Unscramble letters to form a word |
| `jumbled_sentence` | Reorder words to form a sentence |
| `vocab` | Multiple-choice vocabulary |
| `synonyms` | Choose the synonym |
| `antonyms` | Choose the antonym |
| `pronunciation_spelling` | Type the correctly spelled word |
| `grammar_transform` | Transform a sentence grammatically |
| `typing_from_audio` | Type what you hear |

---

#### `GET /api/v1/exercises/:type/seed?difficulty=easy` 🔒

Returns a random seed. `answer_key` and `acceptable_variants` are **stripped**.

**Query:** `difficulty` = `easy` | `medium` | `hard` (default: `medium`)

---

#### `POST /api/v1/exercises/:type/submit` 🔒

```json
{ "seed_id": "uuid", "user_answer": "goes" }
```

For `vocab` / `synonyms` / `antonyms`, `user_answer` is an option ID: `"a"` · `"b"` · `"c"` · `"d"`.

**Scoring:** correct × `{easy: 1, medium: 1.5, hard: 2}` × 100. XP = `score × 0.1` (min 1).
Consumes 1 energy. Updates streak if daily threshold met.

**200** → `{ is_correct, score, xp_awarded, explanation, hints }`
**402 ENERGY_DEPLETED** → `{ error, code, resets_at }`

---

#### `GET /api/v1/exercises/speaking/prompt` 🔒

Returns a speaking prompt matched to the user's XP level.

| XP | CEFR | Difficulty |
|---|---|---|
| 0 – 300 | A1 / A2 | easy |
| 301 – 1500 | B1 / B2 | medium |
| 1501+ | C1 | hard |

---

#### `POST /api/v1/exercises/speaking/evaluate` 🔒

Evaluate a completed speaking recording against a prompt.

```json
{ "audio_id": "uuid", "prompt_id": "uuid" }
```

- Requires `audio_files.status = 'done'` (transcription must be complete)
- Reuses existing `feedback_json` if already analysed — never double-charges Gemini
- Composite score = average of `pronunciation + vocabulary + grammar + fluency`
- XP awarded = `composite_score × 0.2`

**200** → `{ score, xp_awarded, feedback }` (full feedback object)
**202** → `{ message: "Transcript still processing. Try again shortly." }`

---

### Audio

The full audio flow is a 5-step process:

```
POST /audio/upload-init          → get Cloudinary signature
[client uploads to Cloudinary]   → get public_id + secure_url
POST /audio/complete             → verify + enqueue transcription job
GET  /jobs/:id/status            → poll until done (progress 0→100%)
GET  /audio/:id/transcript       → fetch transcript + AI feedback
```

---

#### `POST /api/v1/audio/upload-init` 🔒

Request a signed upload URL. The client uploads the audio **directly to Cloudinary** — it never passes through this server.

```json
{
  "filename": "recording.webm",
  "format": "webm",
  "context_type": "speaking",
  "duration_seconds": 45
}
```

| Field | Values |
|---|---|
| `format` | `webm` · `mp4` · `mp3` · `wav` · `ogg` · `m4a` |
| `context_type` | `speaking` · `interview` · `speed_reading` |

**200** →
```json
{
  "upload_id": "uuid",
  "cloudinary": {
    "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/video/upload",
    "signature": "...",
    "timestamp": 1774461359,
    "apiKey": "...",
    "cloudName": "...",
    "folder": "kikoo/audio/<user-id>"
  },
  "expires_in_seconds": 900
}
```

---

#### `POST /api/v1/audio/complete` 🔒

After the Cloudinary upload, confirm it with the backend. Verifies the asset exists on Cloudinary, then enqueues the transcription job.

```json
{
  "upload_id": "uuid",
  "cloudinary_public_id": "kikoo/audio/user-id/filename",
  "cloudinary_url": "https://res.cloudinary.com/...",
  "format": "webm",
  "duration_seconds": 45,
  "prompt_text": "Describe your morning routine."
}
```

**202** →
```json
{
  "audio_id": "uuid",
  "job_id": "uuid",
  "message": "Transcription started. Poll /jobs/:job_id/status for progress."
}
```

**400 CLOUDINARY_ERROR** — asset not found on Cloudinary
**404 AUDIO_NOT_FOUND** — upload_id doesn't exist or wrong owner

---

#### `GET /api/v1/jobs/:job_id/status` 🔒

Poll transcription progress. User-scoped — returns 404 for other users' jobs.

**200** →
```json
{
  "id": "uuid",
  "status": "processing",
  "progress_pct": 60,
  "error_message": null,
  "updated_at": "2026-03-25T08:01:30.000Z"
}
```

| `status` | Meaning |
|---|---|
| `pending` | Queued, not started |
| `processing` | In progress (check `progress_pct`) |
| `done` | Transcript ready |
| `failed` | Exhausted retries (check `error_message`) |

Progress milestones: `10%` downloading · `30%` downloaded · `60%` transcribed · `80%` analysed · `100%` done.

**404 JOB_NOT_FOUND**

---

#### `GET /api/v1/audio/:audio_id/transcript` 🔒

Fetch the completed transcript and AI feedback.

**200** (when `status = done`) →
```json
{
  "audio_id": "uuid",
  "status": "done",
  "transcript": {
    "id": "uuid",
    "raw_text": "Every morning I like to wake up early...",
    "asr_confidence": 0.85,
    "feedback": {
      "pronunciation": { "score": 82, "issues": [] },
      "vocabulary":    { "score": 85, "strong_words": ["refreshed"], "weak_words": [], "suggestions": [] },
      "grammar":       { "score": 90, "errors": [] },
      "fluency":       { "score": 78, "wpm": 125, "pause_count": 1, "notes": "Good rhythm" },
      "filler_words":  { "count": 0, "words": [] },
      "suggestions":   ["Excellent use of descriptive language"],
      "overall_score": 84,
      "level":         "B2",
      "schema_version": "1.0"
    },
    "schema_version": "1.0",
    "created_at": "2026-03-25T08:01:45.000Z"
  }
}
```

**202** — transcription not complete yet
**404 AUDIO_NOT_FOUND**

---

#### `GET /api/v1/audio` 🔒

Returns the user's 20 most recent audio files (newest first).

**200** → `{ audio: [ ...audio_files rows ] }`

---

#### `DELETE /api/v1/audio/:audio_id` 🔒

Deletes the asset from Cloudinary and removes the database record (cascades to `transcripts`). Used for GDPR deletion.

**200** → `{ message: "Audio and transcript deleted" }`

---

## Background Job Queue

The `JobQueue` (`src/jobs/JobQueue.js`) is an in-process singleton that runs without Redis or Bull.

- Polls every **2 seconds** with `setInterval`
- Processes one job at a time (FIFO)
- Retries failed jobs up to **3 attempts** with **exponential backoff** (2s, 4s, 8s)
- Persists all state to the `jobs` DB table — restarts lose in-memory queue (acceptable for development; add DB-backed recovery for production)
- Starts automatically when `src/index.js` imports it

**Supported job types:** `transcription` · `resume_analyze` · `resume_roast` · `interview_score`

---

## Energy & Streak System

### Daily Energy
- Each submitted exercise costs **1 energy**
- Max **50 exercises** per day
- Resets at **midnight UTC**
- Exceeding limit: `402 ENERGY_DEPLETED` with `resets_at`

### Streak
- Increments when `daily_energy_count ≥ MIN_DAILY_ENERGY_FOR_STREAK` (default: 10)
- One increment per calendar day
- Bonus XP on increment: `streak × 5`

### Streak Badges

| Milestone | Badge ID | Name |
|---|---|---|
| 7 days | `streak_7` | 7-Day Streak |
| 30 days | `streak_30` | 30-Day Streak |
| 100 days | `streak_100` | 100-Day Streak |

---

## Database Schema

```
users
  id · email · password_hash · username · fullname
  role · is_banned · is_flagged · is_admin · created_at · last_active

profiles (1:1 with users)
  user_id · interests[] · education · motive · targets
  resume_ref · subscription_status · pro_expires_at
  streak · xp · daily_energy_count · energy_reset_date
  badges · last_streak_update

refresh_tokens
  id · user_id · token_hash · expires_at · created_at

exercise_seeds
  id · type · difficulty · payload · created_at

exercise_submissions
  id · user_id · seed_id · user_answer
  is_correct · score · xp_awarded · submitted_at

audio_files
  id · user_id · cloudinary_public_id · cloudinary_url
  duration_seconds · format
  status (uploaded | processing | done | failed)
  context_type (speaking | interview | speed_reading)
  archived_at · created_at

transcripts
  id · audio_id · user_id · raw_text · segments
  asr_confidence · feedback_json · schema_version · created_at

jobs
  id · type · status (pending | processing | done | failed)
  progress_pct · user_id · payload_ref
  error_message · attempts · created_at · updated_at
```

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_TOKEN` | 401 | Missing or expired JWT |
| `INVALID_REFRESH_TOKEN` | 401 | Bad or expired refresh token |
| `ACCOUNT_BANNED` | 403 | User account is suspended |
| `DUPLICATE_USER` | 409 | Email or username already in use |
| `VALIDATION_ERROR` | 400 | Joi schema failed |
| `INVALID_TYPE` | 400 | Unknown exercise type |
| `INVALID_DIFFICULTY` | 400 | Unknown difficulty level |
| `NOT_FOUND` | 404 | Resource not found |
| `ENERGY_DEPLETED` | 402 | Daily exercise limit hit |
| `AUDIO_NOT_FOUND` | 404 | Audio file doesn't exist or wrong owner |
| `JOB_NOT_FOUND` | 404 | Job doesn't exist or wrong owner |
| `CLOUDINARY_ERROR` | 400 | Cloudinary API error (asset not found, etc.) |
| `AI_SERVICE_ERROR` | 502 | Gemini API failure |
| `AI_PARSE_ERROR` | 502 | Gemini returned malformed JSON (after retry) |

---

## Security Notes

- Passwords hashed with **bcrypt (12 rounds)**
- Refresh tokens stored as **bcrypt hashes (10 rounds)** — raw token never persisted
- `password_hash` is **never** returned in any API response
- `answer_key` and `acceptable_variants` are **stripped** from all seed responses
- Cloudinary uploads use **signed requests** — clients cannot bypass the folder or resource type restrictions
- Stack traces are **hidden in production** (`NODE_ENV=production`)
- All SQL queries use **parameterized statements** — no string interpolation
- AI errors are caught and normalised — raw Gemini error messages are **never** sent to the client

---

## Postman Collection

Import `KikooAI.postman_collection.json` from the project root.

**Collection variables auto-managed:**

| Variable | Set by |
|---|---|
| `accessToken` | Login / Signup |
| `refreshToken` | Login / Signup |
| `seedId` | Get any exercise seed |
| `uploadId` | Audio upload-init |
| `audioId` | Audio complete |
| `jobId` | Audio complete |

**Includes example responses for every endpoint** including all error cases.

---

## Scripts

```bash
npm run dev       # Start with nodemon (hot reload)
npm start         # Start for production
npm run migrate   # Run pending SQL migrations
node src/seeds/exercises.js   # Seed sample exercise data
```

---

## Milestones

| Milestone | Status | Features |
|---|---|---|
| **M1 — Core Platform** | ✅ Done | Auth (JWT + refresh), user profiles, XP/streak/badges, text exercises (9 types), energy system, Postman collection |
| **M2 — Audio & AI** | ✅ Done | Direct Cloudinary upload, Gemini transcription, structured speaking feedback, in-process job queue, speaking evaluation, GDPR delete |
| **M3 — Interview Prep** | 🔜 Planned | Resume upload, interview scoring, AI roast, resume analysis job |
