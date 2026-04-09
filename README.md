# KikooAI Backend

Production-ready REST API for **KikooAI** — an AI-powered English learning + interview prep platform.

Features: text exercises, XP progression, streaks, personalized daily assignments, direct audio upload, real-time transcription via Gemini AI, structured speaking feedback, resume analysis & roasting, live AI interview (Gemini Live), mock interview scoring, and an in-process job queue — all on a serverless Postgres database.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express.js v5 |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| Auth | JWT (15m access token) + UUID refresh tokens (bcrypt-hashed) |
| Validation | Joi |
| File/Audio storage | Cloudinary v2 (client uploads directly — no proxy) |
| AI | Google Gemini (`@google/generative-ai`) |
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
│   ├── transcriptionJob.js  # Audio transcription handler (Cloudinary → Gemini → DB)
│   ├── resumeJob.js         # Resume analysis/roast handler (Gemini → DB)
│   └── interviewJob.js      # Interview scoring handler (audio → transcribe → per-Q feedback)
├── middleware/
│   ├── auth.js              # JWT Bearer verification → req.user
│   ├── adminGuard.js        # is_admin check (runs after auth)
│   ├── errorHandler.js      # Global 4-arg Express error handler
│   └── validate.js          # Joi request body validator factory
├── migrations/
│   ├── 001_users.sql        # users table
│   ├── 002_profiles.sql     # profiles + refresh_tokens
│   ├── 003_exercises.sql    # exercise_seeds + exercise_submissions
│   ├── 004_audio.sql        # audio_files + transcripts + jobs
│   ├── 005_resumes.sql      # resumes + resume_reports
│   └── 006_interview.sql    # interview_rooms + job_listings + indexes
├── routes/
│   ├── auth.js              # /auth/* and /users/me
│   ├── exercises.js         # /exercises/*
│   ├── audio.js             # /audio/* and /jobs/:id/status
│   ├── resumes.js           # /resumes/*
│   ├── interview.js         # /interview/*
│   ├── jobs.js              # /jobs (list)
│   └── assignments.js       # /assignments/daily
├── services/
│   ├── authService.js       # Auth DB logic (signup, login, refresh, profile)
│   ├── exerciseService.js   # Exercise + energy + streak + speaking evaluation
│   ├── cloudinaryService.js # Signed upload (audio+resume), verify, download, delete
│   ├── geminiService.js     # Transcribe, analyse transcript, resume analysis, interview feedback + question generation
│   ├── resumeService.js     # Resume CRUD + report creation + text extraction
│   ├── interviewService.js  # Room lifecycle + config + question cache + report save
│   └── assignmentService.js # Personalized daily assignment builder (XP-based)
├── db/
│   └── seed.js              # Exercise seed data — run once with npm run seed
├── utils/
│   ├── cloudinary.js        # Pre-configured Cloudinary v2 instance
│   ├── gemini.js            # Gemini model factory
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

### 4. Seed exercise data (required for exercises + assignments)

```bash
npm run seed
```

Inserts 36 exercise seeds covering all 9 types across easy/medium/hard difficulties, plus 6 speaking prompts. Must be run at least once before testing exercises or daily assignments.

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
| `GEMINI_MODEL` | — | Gemini model ID (default: `gemini-1.5-flash`) — use `gemini-2.0-flash` for current API |
| `AI_API_KEY` | — | Alias for `GEMINI_API_KEY` (legacy) |
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

No auth required. Returns database status, env var completeness, job queue depth, and mounted routes.

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

---

#### `POST /api/v1/auth/login`

**200** → `{ user, accessToken, refreshToken }`

---

#### `POST /api/v1/auth/refresh`

```json
{ "refreshToken": "uuid-v4" }
```

**200** → new token pair. Old refresh token invalidated.

---

#### `POST /api/v1/auth/logout` 🔒

Invalidates all refresh tokens for the user.

---

### User

#### `GET /api/v1/users/me` 🔒

Returns the authenticated user + full profile (XP, streak, badges, subscription).

#### `PATCH /api/v1/users/me` 🔒

Update any subset of: `interests`, `education`, `motive`, `targets`, `resume_ref`.

---

### Exercises

All exercise routes require authentication.

#### `GET /api/v1/exercises/:type/seed?difficulty=easy` 🔒

Returns a random seed. `answer_key` stripped from response.

**Types:** `fillup` · `jumbled_word` · `jumbled_sentence` · `vocab` · `synonyms` · `antonyms` · `pronunciation_spelling` · `grammar_transform` · `typing_from_audio`

#### `POST /api/v1/exercises/:type/submit` 🔒

```json
{ "seed_id": "uuid", "user_answer": "goes" }
```

**200** → `{ is_correct, score, xp_awarded, explanation, hints }`
**402 ENERGY_DEPLETED** → `{ error, code, resets_at }`

#### `GET /api/v1/exercises/speaking/prompt` 🔒

Returns a speaking prompt matched to the user's XP/CEFR level.

#### `POST /api/v1/exercises/speaking/evaluate` 🔒

```json
{ "audio_id": "uuid", "prompt_id": "uuid" }
```

**200** → `{ score, xp_awarded, feedback }`

---

### Audio

Full flow: `upload-init → [upload to Cloudinary] → complete → poll /jobs/:id/status → GET transcript`

#### `POST /api/v1/audio/upload-init` 🔒

Get a signed Cloudinary upload URL. Returns `upload_id` + Cloudinary params.

#### `POST /api/v1/audio/complete` 🔒

Confirm upload. Enqueues transcription job. Returns `{ audio_id, job_id }` (202).

#### `GET /api/v1/jobs/:job_id/status` 🔒

Poll job progress. `status`: `pending` → `processing` → `done` | `failed`.

#### `GET /api/v1/audio/:audio_id/transcript` 🔒

Fetch completed transcript + AI feedback (pronunciation, vocabulary, grammar, fluency).

#### `GET /api/v1/audio` 🔒

List 20 most recent audio files.

#### `DELETE /api/v1/audio/:audio_id` 🔒

Deletes from Cloudinary and DB (cascades to transcripts).

---

### Resumes

All resume routes require authentication.

#### `POST /api/v1/resumes/upload-init` 🔒

Get a signed Cloudinary upload URL for a PDF/DOCX/TXT resume.

**200** → `{ resume_id, cloudinary: { uploadUrl, signature, timestamp, apiKey, cloudName, folder } }`

Upload URL targets Cloudinary's `/raw/upload` endpoint.

#### `POST /api/v1/resumes/upload-complete` 🔒

Confirm the Cloudinary upload and attach it to the resume record.

```json
{
  "resume_id": "uuid",
  "cloudinary_public_id": "kikoo/resumes/<user-id>/my-cv",
  "cloudinary_url": "https://res.cloudinary.com/...",
  "format": "pdf",
  "title": "My Resume"
}
```

**200** → `{ resume }`

#### `POST /api/v1/resumes/save-json` 🔒

Save a structured resume as JSON (no file upload needed).

```json
{ "title": "My Resume", "json_blob": { ... } }
```

**201** → `{ resume }`

#### `POST /api/v1/resumes/analyze` 🔒

Trigger an ATS-style AI analysis against a job description.

```json
{ "resume_id": "uuid", "jd_text": "at least 50 chars...", "cover_letter": "optional" }
```

**202** → `{ report_id, job_id, message }`

#### `POST /api/v1/resumes/roast` 🔒

Same as analyze but returns witty, sharp feedback in `roast_lines`.

**202** → `{ report_id, job_id, message }`

#### `GET /api/v1/resumes/reports/:report_id` 🔒

Poll analysis result. **202** while processing. **200** when done with full `report` JSON:
`strengths`, `ats_issues`, `suggested_bullets`, `improvement_steps`, `keywords_missing/matched`, `score`, `score_breakdown`, `summary`, `roast_lines`.

#### `GET /api/v1/resumes` 🔒

List 20 most recent resumes.

#### `DELETE /api/v1/resumes/:resume_id` 🔒

Deletes from Cloudinary (if file resume) and DB (cascades to resume_reports).

---

### Assignments

#### `GET /api/v1/assignments/daily` 🔒

Returns a personalized daily exercise set based on the user's XP level.

**XP → difficulty mapping:**

| XP | Difficulty | CEFR |
|---|---|---|
| ≤ 300 | easy | A1/A2 |
| ≤ 1500 | medium | B1/B2 |
| > 1500 | hard | C1/C2 |

Returns 6 exercises (1× fillup, jumbled_sentence, vocab, synonyms, grammar_transform, speaking_prompt). Falls back to medium/easy if no seed exists at the user's level. `answer_key` is stripped.

**200** →
```json
{
  "level": { "xp": 450, "cefr": "B1/B2", "difficulty": "medium", "daily_energy_used": 3 },
  "assignments": [
    { "type": "fillup", "seed": { "id": "uuid", "type": "fillup", "difficulty": "medium", "payload": { ... } } },
    { "type": "jumbled_sentence", "seed": { ... } },
    { "type": "vocab", "seed": { ... } },
    { "type": "synonyms", "seed": { ... } },
    { "type": "grammar_transform", "seed": { ... } },
    { "type": "speaking_prompt", "seed": { ... } }
  ],
  "progress": { "completed_today": 3, "total": 6 }
}
```

Submit each assignment using the existing `POST /api/v1/exercises/:type/submit` endpoint with the seed's `id`.

---

### Interview

All interview routes require authentication.

#### `GET /api/v1/interview/config` 🔒

Returns Gemini credentials for the client to open a Gemini Live audio session directly.

**200** →
```json
{
  "gemini_api_key": "AIza...",
  "live_model": "gemini-2.5-flash-native-audio-preview-09-2025",
  "analysis_model": "gemini-2.5-flash-preview-05-20",
  "voices": { "emma": "Kore", "john": "Puck" }
}
```

---

#### `GET /api/v1/interview/questions?role=&round=&difficulty=` 🔒

Returns 12 AI-generated interview questions for the given combination. Results are **cached in-memory for 1 hour** per unique `role+round+difficulty` key.

| Param | Default | Notes |
|---|---|---|
| `role` | — | **Required** |
| `round` | `Technical` | e.g. HR, Coding, System Design |
| `difficulty` | `Medium` | Easy · Medium · Hard |

**200** → `{ questions: [{ question, difficulty, category }] }`
**400** → `MISSING_ROLE`
**502** → `AI_SERVICE_ERROR` / `AI_PARSE_ERROR`

---

#### `POST /api/v1/interview/rooms/:room_id/save-report` 🔒

Saves the client-generated transcript and analysis report after a Gemini Live session ends. Sets room `status = done`.

```json
{
  "transcript": [
    { "role": "Dr. Emma", "text": "Tell me about yourself." },
    { "role": "You", "text": "I am a backend developer..." }
  ],
  "report": {
    "score": 78,
    "feedback": "Strong technical answers.",
    "strengths": ["Clear articulation"],
    "improvements": ["More detail on system design"],
    "technicalAccuracy": "Strong",
    "communicationStyle": "Confident"
  }
}
```

**200** → `{ room_id, status: "done" }`

---

#### Live Interview End-to-End Flow

```
1. POST /interview/rooms/create        { job_role, round, difficulty, duration }
2. GET  /interview/config              ← Gemini key + voice
3. GET  /interview/questions?role=...  ← 12 AI questions (cached)
4. POST /interview/rooms/:id/record/start
5. [Gemini Live runs client ↔ Gemini directly — no backend proxy]
6. POST /interview/rooms/:id/record/stop  { audio_id }   (optional, if audio recorded)
7. POST /interview/rooms/:id/save-report  { transcript, report }
8. GET  /interview/rooms/:id/result       ← fetch saved result anytime
```

---

#### `POST /api/v1/interview/rooms/create` 🔒

Create a new interview room with optional settings and questions.

```json
{
  "duration_mins": 30,
  "job_role": "Backend Developer",
  "company": "Acme Corp",
  "difficulty": "medium",
  "questions": [
    { "question_text": "Tell me about yourself." }
  ]
}
```

**201** → `{ room_id, room_token, settings, status }`

#### `POST /api/v1/interview/rooms/:room_id/record/start` 🔒

Mark the room as recording. **200** → `{ room_id, status, start_ts }`

#### `POST /api/v1/interview/rooms/:room_id/record/stop` 🔒

Stop recording, attach audio, and trigger AI processing.

```json
{ "audio_id": "uuid" }
```

**202** → `{ room_id, job_id, status: "processing", message }`

#### `GET /api/v1/interview/rooms/:room_id/result` 🔒

Get interview result. Returns `{ room_id, status, result }`.
`result` contains: `transcript`, `question_results` (per-question feedback), `overall_score`, `summary`.

#### `GET /api/v1/interview/rooms` 🔒

List 20 most recent interview rooms.

#### `POST /api/v1/interview/questions/evaluate` 🔒

Evaluate any question + answer immediately (no room needed).

```json
{
  "question_text": "Explain SQL vs NoSQL.",
  "answer_text": "SQL uses schemas...",
  "job_role": "Backend Developer"
}
```

At least one of `answer_text` or `audio_id` required.

**200** → `{ feedback, overall_score }`

Feedback contains: `relevance_score`, `communication_score`, `structure_score`, `confidence_indicators`, `star_method_used`, `strengths`, `improvements`, `model_answer_outline`, `overall_score`, `one_line_verdict`.

---

### Jobs

#### `GET /api/v1/jobs` 🔒

List the 20 most recent jobs for the authenticated user.

**200** → `{ jobs: [ { id, type, status, progress_pct, error_message, created_at, updated_at } ] }`

#### `GET /api/v1/jobs/:job_id/status` 🔒

Poll a specific job's status. (Also accessible at `/api/v1/jobs/:job_id/status` via the audio router.)

---

## Background Job Queue

The `JobQueue` (`src/jobs/JobQueue.js`) is an in-process singleton that runs without Redis or Bull.

- Polls every **2 seconds** with `setInterval`
- Processes one job at a time (FIFO)
- Retries failed jobs up to **3 attempts** with **exponential backoff** (2s, 4s, 8s)
- Persists all state to the `jobs` DB table
- Supports pre-created job rows (pass `jobId` in options to `enqueue()`)

**Supported job types:** `transcription` · `resume_analyze` · `interview_score`

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

| Milestone | Badge ID |
|---|---|
| 7 days | `streak_7` |
| 30 days | `streak_30` |
| 100 days | `streak_100` |

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

resumes
  id · user_id · title · json_blob
  cloudinary_public_id · cloudinary_url · file_format
  created_at · updated_at

resume_reports
  id · resume_id · job_id · jd_text · cover_letter
  analysis_type (analyze | roast)
  report_json · score · status (pending | processing | done | failed)
  created_at

interview_rooms
  id · host_id · room_token · settings
  status (created | recording | processing | done | failed)
  start_ts · end_ts · audio_id · result_json · created_at

job_listings
  id · title · company · location · job_type · description
  url · source (admin | partner) · is_active · created_at
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
| `NOT_FOUND` | 404 | Route doesn't exist |
| `ENERGY_DEPLETED` | 402 | Daily exercise limit hit |
| `AUDIO_NOT_FOUND` | 404 | Audio file doesn't exist or wrong owner |
| `JOB_NOT_FOUND` | 404 | Job doesn't exist or wrong owner |
| `RESUME_NOT_FOUND` | 404 | Resume doesn't exist or wrong owner |
| `REPORT_NOT_FOUND` | 404 | Resume report doesn't exist or wrong owner |
| `ANALYSIS_FAILED` | 500 | Resume report job completed with failure |
| `ROOM_NOT_FOUND` | 404 | Interview room doesn't exist or wrong owner |
| `MISSING_ROLE` | 400 | `role` query param missing on /interview/questions |
| `ROOM_ALREADY_ACTIVE` | 400 | Room is already recording or completed |
| `ROOM_NOT_RECORDING` | 400 | Tried to stop a non-recording room |
| `ANSWER_REQUIRED` | 400 | Neither `answer_text` nor `audio_id` provided |
| `FILE_NOT_FOUND_ON_CLOUDINARY` | 400 | Resume file not found on Cloudinary |
| `CLOUDINARY_ERROR` | 400 | Cloudinary API error |
| `JD_TOO_SHORT` | 400 | Job description must be at least 50 characters |
| `AI_SERVICE_ERROR` | 502 | Gemini API failure |
| `AI_PARSE_ERROR` | 502 | Gemini returned malformed JSON (after retry) |

---

## Security Notes

- Passwords hashed with **bcrypt (12 rounds)**
- Refresh tokens stored as **bcrypt hashes (10 rounds)** — raw token never persisted
- `password_hash` is **never** returned in any API response
- `answer_key` stripped from all exercise seed responses
- Cloudinary uploads use **signed requests** — clients cannot bypass folder or type restrictions
- Stack traces **hidden in production** (`NODE_ENV=production`)
- All SQL uses **parameterized statements** — no string interpolation
- Gemini errors are caught and normalised — raw AI error messages never sent to client

---

## Postman Collection

Import `KikooAI.postman_collection.json` from the project root.

**Collection variables auto-managed:**

| Variable | Set by |
|---|---|
| `accessToken` | Login / Signup |
| `refreshToken` | Login / Signup |
| `seedId` | Get any exercise seed · Get Daily Assignment (first seed) |
| `uploadId` | Audio upload-init |
| `audioId` | Audio complete |
| `jobId` | Audio complete / Resume analyze / Interview stop |
| `resumeId` | Resume save-json / upload-complete |
| `reportId` | Resume analyze / roast |
| `roomId` | Interview room create |

**Includes example responses for every endpoint** including all error cases.

---

## Frontend Guide

See [`FRONTEND_IMPLEMENTATION_GUIDE.md`](./FRONTEND_IMPLEMENTATION_GUIDE.md) for a complete frontend integration reference including:
- Code snippets for all flows
- Cloudinary upload helpers
- Token refresh interceptor example
- Polling helpers
- Complete flow diagrams

---

## Scripts

```bash
npm run dev       # Start with nodemon (hot reload)
npm start         # Start for production
npm run migrate   # Run pending SQL migrations
npm run seed      # Seed exercise data (run once after migrate)
```

---

## Milestones

| Milestone | Status | Features |
|---|---|---|
| **M1 — Core Platform** | ✅ Done | Auth (JWT + refresh), user profiles, XP/streak/badges, text exercises (9 types), energy system, Postman collection |
| **M2 — Audio & AI** | ✅ Done | Direct Cloudinary upload, Gemini transcription, structured speaking feedback, in-process job queue, speaking evaluation, GDPR delete |
| **M3 — Interview Prep** | ✅ Done | Resume upload (file + JSON), resume analysis & roast (AI), mock interview rooms, per-question AI scoring, scraped question evaluator, frontend implementation guide |
| **M4 — Live Interview + Assignments** | ✅ Done | Personalized daily assignments (XP-based), Gemini Live config endpoint, AI question generation (cached), live interview report save, Cloudinary signature fix, exercise seed data |
