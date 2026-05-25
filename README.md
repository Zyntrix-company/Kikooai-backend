# KikooAI Backend

Production-ready REST API for **KikooAI** — an AI-powered English learning, interview prep, mini-games, and competitive contests platform.

**Base URL (production):** `https://72-61-251-132.sslip.io` (HTTPS via Let's Encrypt — see [deploy/DEPLOY.md](deploy/DEPLOY.md))

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express.js v5 |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| Auth | JWT (15m access token) + UUID refresh tokens (bcrypt-hashed) + Google OAuth (ID token verification) |
| Validation | Joi |
| File/Audio storage | Cloudinary v2 (client uploads directly — no proxy) |
| AI | Google Gemini 2.0 Flash (generation) + `gemini-embedding-001` (Contextooo semantic similarity) |
| Background jobs | In-process `JobQueue` (setInterval — see `docs/JOBS.md` for Bull+Redis upgrade path) |
| PDF generation | pdfkit (contest certificates) |
| Rate limiting | express-rate-limit |

---

## Project Structure

```
src/
├── db/
│   ├── pool.js               # Singleton pg connection pool (Neon)
│   └── migrate.js            # SQL migration runner (tracks applied files)
├── jobs/
│   ├── JobQueue.js           # Lightweight in-process job queue (singleton)
│   ├── transcriptionJob.js   # Audio transcription handler (Cloudinary → Gemini → DB)
│   ├── resumeJob.js          # Resume analysis/roast handler (Gemini → DB)
│   ├── interviewJob.js       # Interview scoring handler (audio → transcribe → per-Q feedback)
│   ├── retentionJob.js       # Audio retention cron (archive files older than 90 days)
│   └── energyResetJob.js     # Daily midnight UTC bulk reset of daily_energy_count
├── middleware/
│   ├── auth.js               # JWT Bearer verification → req.user
│   ├── adminGuard.js         # is_admin check (runs after auth)
│   ├── errorHandler.js       # Global 4-arg Express error handler
│   ├── rateLimiter.js        # express-rate-limit configs (auth/upload/scoring)
│   └── validate.js           # Joi request body validator factory
├── migrations/
│   ├── 001_users.sql         # users table
│   ├── 002_profiles.sql      # profiles + refresh_tokens
│   ├── 003_exercises.sql     # exercise_seeds + exercise_submissions
│   ├── 004_audio.sql         # audio_files + transcripts + jobs
│   ├── 005_resumes.sql       # resumes + resume_reports
│   ├── 006_interview.sql     # interview_rooms + job_listings
│   ├── 007_games.sql         # games + game_scores
│   ├── 008_contests.sql      # contests + contest_participants + admin_actions
│   ├── 009_admin.sql         # promo_codes + promo_code_redemptions + users.flags
│   ├── 010_exports.sql       # exports + audio archived status
│   ├── 011_certificates.sql  # contest_participants.certificate_url
│   ├── 012_jobs_error_code.sql          # adds error_code to jobs
│   ├── 013_resume_reports_last_error.sql # adds last_error to resume_reports
│   └── 014_google_oauth.sql  # google_id + auth_provider on users; password_hash nullable
├── routes/
│   ├── auth.js               # /auth/* and /users/me (+ DELETE /users/me GDPR)
│   ├── exercises.js          # /exercises/*
│   ├── audio.js              # /audio/* and /jobs/:id
│   ├── resumes.js            # /resumes/*
│   ├── interview.js          # /interview/*
│   ├── jobs.js               # /jobs (list)
│   ├── assignments.js        # /assignments/daily
│   ├── games.js              # /games/:type/seed, /games/:type/score, /games/contextooo/rank
│   ├── contests.js           # /contests/*
│   └── admin.js              # /admin/* (admin-only) + /promo-codes/redeem (auth)
├── services/
│   ├── authService.js        # Auth DB logic (signup, login, refresh, profile)
│   ├── exerciseService.js    # Exercise + energy + streak + speaking evaluation
│   ├── cloudinaryService.js  # Signed upload, verify, download, delete, buffer upload
│   ├── geminiService.js      # Transcribe, analyse transcript, resume analysis, interview feedback
│   ├── resumeService.js      # Resume CRUD + report creation + text extraction
│   ├── interviewService.js   # Room lifecycle + config + question cache + report save
│   ├── assignmentService.js  # Personalized daily assignment builder (XP-based)
│   ├── gameService.js        # Game seed fetch + score submission + Contextooo semantic ranking
│   ├── contestService.js     # Contest CRUD, join, leaderboard, rank recalc, prize distribution
│   ├── adminService.js       # User management, badges, Pro, promo codes, logs, exports, job retry
│   └── certificateService.js # PDF certificate generator (pdfkit)
├── seeds/
│   ├── exercises.js          # 9 exercise types × 3 difficulties + 6 speaking prompts
│   ├── games.js              # 5 game types × 3 difficulties (15 seeds)
│   ├── users.js              # 3 test users + 1 admin (idempotent)
│   ├── contests.js           # 2 sample contests (1 active, 1 completed)
│   └── resumes.js            # 2 resume + JD pairs for testing analysis
├── utils/
│   ├── cloudinary.js         # Pre-configured Cloudinary v2 instance
│   ├── gemini.js             # Gemini model factory
│   ├── response.js           # success() / fail() response helpers
│   └── sanitize.js           # sanitizeUser() — strips password_hash
└── index.js                  # Entry point — mounts all routers, rate limiters, retention cron
scripts/
└── smoke-test.js             # End-to-end smoke test (all major flows)
docs/
├── openapi.yaml              # Full OpenAPI 3.0 specification (~50 endpoints)
├── ENV.md                    # All environment variables documented
└── JOBS.md                   # Job queue internals + Bull/Redis upgrade path
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

Fill in all required variables. See [`docs/ENV.md`](./docs/ENV.md) for the full reference.

### 3. Run migrations

```bash
npm run migrate
```

Applies all 11 migrations in order. Each runs in a transaction and is skipped if already applied (tracked in `migrations_run` table).

### 4. Seed data

```bash
# Seed everything at once (recommended for first-time setup)
npm run seed:all

# Or seed individually:
npm run seed:users      # Test users + admin (required for smoke test)
npm run seed:exercises  # Exercise seeds (required for exercises + assignments)
npm run seed:games      # Game seeds (required for games)
npm run seed:contests   # Sample contests
npm run seed:resumes    # Sample resume + JD pairs
```

### 5. Start the server

```bash
npm run dev    # Development (nodemon, hot reload)
npm start      # Production
```

Server starts on `PORT` (default `3000`). The JobQueue ticker and audio retention cron start automatically.

### 6. Run smoke tests

```bash
# Against local server (run npm run dev first, seed:users required)
npm run smoke

# Against production
BASE_URL=https://kikooai-backend.onrender.com/api/v1 \
SMOKE_ADMIN_EMAIL=admin@kikoo.test \
SMOKE_ADMIN_PASSWORD=Admin1234! \
npm run smoke
```

---

## Environment Variables

See [`docs/ENV.md`](./docs/ENV.md) for the full table. Quick reference:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing access tokens |
| `JWT_EXPIRY` | ✅ | Access token TTL (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRY` | ✅ | Refresh token TTL in seconds (e.g. `604800`) |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |
| `GEMINI_API_KEY` | ✅ | Google AI Studio API key |
| `GEMINI_MODEL` | — | Gemini model (default: `gemini-2.0-flash`) |
| `GOOGLE_CLIENT_ID` | ✅ | Web OAuth client ID from Google Cloud Console (for mobile ID token verification) |
| `APP_BASE_URL` | — | Public backend URL — used for contest share links |
| `AUDIO_RETENTION_DAYS` | — | Days before audio archival (default: `90`) |
| `PORT` | — | Server port (default: `3000`) |
| `NODE_ENV` | — | `development` or `production` |

---

## API Reference

**Base URL:** `https://kikooai-backend.onrender.com` (production) · `http://localhost:3000` (dev)
**Auth header:** `Authorization: Bearer <accessToken>` — required on all 🔒 endpoints.

**Response envelope:**
```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

Full OpenAPI 3.0 spec: [`docs/openapi.yaml`](./docs/openapi.yaml)

---

### Health

#### `GET /healthz`

No auth. Returns DB status, env var completeness, job queue depth, and mounted routes.

---

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | — | Register. Returns user + token pair. |
| POST | `/api/v1/auth/login` | — | Login. Returns user + token pair. |
| POST | `/api/v1/auth/google` | — | Google Sign-In — verify mobile ID token, create or find user. |
| POST | `/api/v1/auth/refresh` | — | Rotate refresh token. Body: `{ refreshToken }` |
| POST | `/api/v1/auth/logout` | 🔒 | Invalidate all refresh tokens. |

Signup body: `{ email, password (min 8), username (alphanum 3–30), fullname, role (student|job_seeker|professional) }`
Login body: `{ email, password }`
Google body: `{ idToken, role? (required for new users), username? (required for new users) }`

**201/200** → `{ user, accessToken, refreshToken }`
Google response also includes `isNewUser: boolean` — use it to decide whether to show onboarding.

Account linking: if the Google email matches an existing password-registered account, the Google ID is automatically linked — no duplicate account is created.

> See [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for the full Google Cloud Console + Flutter + React Native setup guide.

---

### Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/users/me` | 🔒 | Current user + full profile (XP, streak, badges, subscription). |
| PATCH | `/api/v1/users/me` | 🔒 | Update profile fields: `interests`, `education`, `motive`, `targets`, `resume_ref`. |
| DELETE | `/api/v1/users/me` | 🔒 | GDPR erasure — deletes all Cloudinary assets then hard-deletes account. |

---

### Exercises

All routes 🔒. Rate limited: 30 req/min.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/exercises/:type/seed?difficulty=` | Random seed. `answer_key` stripped. |
| POST | `/api/v1/exercises/:type/submit` | Submit answer. Body: `{ seed_id, user_answer }`. Returns `{ is_correct, score, xp_awarded, explanation, new_total_xp, streak_count }`. **402** on energy depleted. |
| GET | `/api/v1/exercises/speaking/prompt` | Speaking prompt matched to user CEFR level. |
| POST | `/api/v1/exercises/speaking/evaluate` | Evaluate audio speaking. Body: `{ audio_id, prompt_id }`. |

**Types:** `fillup` · `jumbled_word` · `jumbled_sentence` · `vocab` · `synonyms` · `antonyms` · `pronunciation_spelling` · `grammar_transform` · `typing_from_audio`

**Difficulty:** `easy` · `medium` · `hard`

---

### Audio

Full flow: `upload-init → upload to Cloudinary → complete → poll job → fetch transcript`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/audio/upload-init` 🔒 | Get signed Cloudinary upload URL. Body: `{ filename, format, context_type, duration_seconds? }` |
| POST | `/api/v1/audio/complete` 🔒 | Confirm upload. Returns `{ audio_id, job_id }` (202). |
| GET | `/api/v1/audio/:id/transcript` 🔒 | Fetch completed transcript + AI feedback. |
| GET | `/api/v1/audio` 🔒 | List 20 most recent audio files. |
| DELETE | `/api/v1/audio/:id` 🔒 | Delete from Cloudinary + DB (cascades to transcripts). |

---

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/jobs` 🔒 | List 20 most recent jobs for authenticated user. |
| GET | `/api/v1/jobs/:id` 🔒 | Poll job status: `pending` → `processing` → `done` \| `failed`. Returns `progress_pct`. |

---

### Resumes

All routes 🔒.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/resumes/upload-init` | Get signed Cloudinary URL for PDF/DOCX/TXT. |
| POST | `/api/v1/resumes/upload-complete` | Confirm + verify upload. Body: `{ resume_id, cloudinary_public_id, cloudinary_url, format, title? }` |
| POST | `/api/v1/resumes/save-json` | Save structured resume as JSON. Body: `{ title, json_blob }` |
| POST | `/api/v1/resumes/analyze` | Trigger AI analysis. Body: `{ resume_id, jd_text (min 50), cover_letter? }`. Returns **202** `{ report_id, job_id }` |
| POST | `/api/v1/resumes/roast` | Same as analyze, witty commentary in `roast_lines`. |
| GET | `/api/v1/resumes/reports/:id` | Poll report. **202** processing, **200** done with full JSON. |
| GET | `/api/v1/resumes` | List 20 most recent resumes. |
| DELETE | `/api/v1/resumes/:id` | Delete resume + all reports. |

---

### Assignments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/assignments/daily` 🔒 | Personalized daily exercise set (6 exercises). XP → difficulty mapping: ≤300 easy, ≤1500 medium, >1500 hard. |

Returns `{ level: { xp, cefr, difficulty, daily_energy_used }, assignments: [...], progress: { completed_today, total } }`.

---

### Interview

All routes 🔒.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/interview/config` | Gemini credentials for client-side Gemini Live session. |
| GET | `/api/v1/interview/questions?role=&round=&difficulty=` | 12 AI-generated questions (cached 1h per key). |
| POST | `/api/v1/interview/rooms/create` | Create room. Body: `{ job_role, company?, difficulty?, duration_mins?, questions? }` |
| POST | `/api/v1/interview/rooms/:id/record/start` | Mark room as recording. |
| POST | `/api/v1/interview/rooms/:id/record/stop` | Stop + enqueue AI scoring. Body: `{ audio_id }`. Returns **202** `{ job_id }` |
| GET | `/api/v1/interview/rooms/:id/result` | Fetch room result (transcript, per-question feedback, overall score). |
| POST | `/api/v1/interview/rooms/:id/save-report` | Save client-generated Gemini Live report. Body: `{ transcript, report }` |
| GET | `/api/v1/interview/rooms` | List 20 most recent rooms. |
| POST | `/api/v1/interview/questions/evaluate` | Evaluate any question+answer immediately. Body: `{ question_text, answer_text?, audio_id?, job_role? }` |

**Job listings:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/jobs/listings?title=&location=&company=` 🔒 | Filter job listings. |

---

### Games

All routes 🔒. Rate limited: 30 req/min.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/games/:type/seed` | Random seed for game type. `answer_key` stripped. Returns `{ game: { id, type, difficulty, config, seed_json } }` |
| POST | `/api/v1/games/contextooo/rank` | Rank a word guess against the secret word using semantic similarity. Body: `{ seedId, guess }`. Returns `{ rank, similarity }` |
| POST | `/api/v1/games/:type/score` | Submit final score. Body: `{ game_id, score, combo?, hearts_left?, time_taken_seconds?, metadata? }`. Returns `{ saved, rank }` |

**Game types:** `conexo` · `speed_reading` · `contextooo` · `word_blitz` · `guess_the_word`

**Contextooo rank endpoint:**
- Uses Gemini `gemini-embedding-001` (override via `GEMINI_EMBEDDING_MODEL`) to compute cosine similarity between the guess and the secret word
- `rank 1` = the secret word itself; scale is 1 (closest) → 1000 (furthest)
- Call this on every guess during gameplay; call `/score` once at the end to record the final result

```
GET /games/contextooo/seed   →  { game: { id: "uuid", ... } }  ← save this id as seedId
POST /games/contextooo/rank  →  { rank: 150, similarity: 0.85 }  ← per guess
POST /games/contextooo/score →  { saved: true, rank: 4 }  ← end of game
```

---

### Contests

All routes 🔒.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/contests` | Admin | Create contest. Body: `{ title, game_type, start_ts?, end_ts?, prize_info?, settings? }` |
| GET | `/api/v1/contests` | 🔒 | List active contests with participant counts. |
| POST | `/api/v1/contests/:token/join` | 🔒 | Join contest by token. Returns `{ participant_token, game_seed }`. No energy deducted. |
| GET | `/api/v1/contests/:token/leaderboard` | 🔒 | Live leaderboard (RANK window function). Returns `{ leaderboard, my_rank, my_score }`. Each entry includes `certificate_url` (null until contest completed + winner). |
| POST | `/api/v1/contests/:token/score` | 🔒 | Submit score. Only updates if higher than current. Recalculates ranks. Body: `{ score, metadata? }` |
| POST | `/api/v1/contests/:token/complete` | Admin | Finalize contest: freeze ranks, grant Pro to rank-1 winners, generate + upload certificate PDFs, audit log. |

---

### Admin

All routes 🔒 + admin-only (except `/promo-codes/redeem`). Every action is audit-logged to `admin_actions`.

**User management:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/admin/users?search=&limit=&offset=` | List users (paginated, ILIKE search on email+username). |
| GET | `/api/v1/admin/users/:id` | Full user detail + profile + activity counts. |
| POST | `/api/v1/admin/users/:id/ban` | Ban user. Body: `{ reason? }` |
| POST | `/api/v1/admin/users/:id/unban` | Unban user. |
| POST | `/api/v1/admin/users/:id/flag` | Flag user. Body: `{ reason }` |
| DELETE | `/api/v1/admin/users/:id` | Hard-delete user (cannot self-delete). |
| POST | `/api/v1/admin/users/:id/badges/assign` | Assign badge. Body: `{ badge_id, badge_name }` |
| POST | `/api/v1/admin/users/:id/badges/remove` | Remove badge. Body: `{ badge_id }` |
| POST | `/api/v1/admin/users/:id/grant-pro` | Grant Pro subscription. Body: `{ days (1–3650) }` |
| POST | `/api/v1/admin/users/:id/revoke-pro` | Revoke Pro subscription immediately. |

**Promo codes:**

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/admin/promo-codes` | Admin | Create promo code. Body: `{ code, discount_pct, max_uses?, grants_pro?, pro_days?, expires_at? }` |
| GET | `/api/v1/admin/promo-codes` | Admin | List all codes with redemption stats. |
| PATCH | `/api/v1/admin/promo-codes/:id` | Admin | Toggle `is_active`. |
| POST | `/api/v1/promo-codes/redeem` | 🔒 | Redeem a code. Body: `{ code }`. Grants Pro if `grants_pro = true`. |

**Logs, jobs, exports:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/admin/logs?status=&type=&limit=&offset=` | Job logs (filterable). |
| POST | `/api/v1/admin/jobs/:job_id/retry` | Re-enqueue a failed job. |
| POST | `/api/v1/admin/export` | Trigger async CSV export. Body: `{ export_type: users|transcripts|contest_results|game_scores }`. Returns **202** `{ export_id }` |
| GET | `/api/v1/admin/exports` | List export jobs and their Cloudinary download URLs. |

---

## Background Jobs

The `JobQueue` (`src/jobs/JobQueue.js`) is an in-process singleton — no Redis or Bull required.

- Polls every **2 seconds**
- One job at a time (FIFO)
- **3 attempts max** with exponential backoff (2s → 4s → 8s)
- All state persisted to `jobs` DB table

**Supported types:** `transcription` · `resume_analyze` · `resume_roast` · `interview_score`

**`energyResetJob`** runs outside the JobQueue — it's a standalone `setTimeout`-based scheduler that fires at **00:00 UTC** on startup (then every 24h). Executes a bulk `UPDATE profiles SET daily_energy_count = 0 WHERE energy_reset_date < (NOW() AT TIME ZONE 'UTC')::date`. All read/submit paths use the same UTC date for consistency.

See [`docs/JOBS.md`](./docs/JOBS.md) for internals, monitoring, and the Bull+Redis upgrade path.

---

## Energy & Streak System

### Daily Energy
- Each submitted exercise costs **1 energy** (max 50/day, resets midnight UTC)
- Exceeding limit → `402 ENERGY_DEPLETED` with `resets_at`
- Contests **never** deduct energy
- **Reset is automatic** — `energyResetJob` bulk-resets all stale users at **00:00 UTC** daily
- **Read-path safe** — `GET /users/me` and `GET /assignments/daily` use UTC dates; per-user reset persists on submit and daily fetch
- **Content dedup** — each `GET …/seed` returns a seed the user has not seen yet (`user_seed_exposures` + submissions/scores); cycles only after the full pool for that type/difficulty is exhausted

### Streak
- Increments when `daily_energy_count ≥ MIN_DAILY_ENERGY_FOR_STREAK` (default: 10)
- **At most one increment per UTC calendar day** (atomic DB check on `last_streak_update`)
- Consecutive UTC days: `streak + 1`; missed day(s): resets to `1`
- Bonus XP on increment = `new_streak × 5`

### Streak Badges
| Milestone | Badge ID |
|---|---|
| 7 days | `streak_7` |
| 30 days | `streak_30` |
| 100 days | `streak_100` |

---

## Database Schema (14 migrations)

```
users               id · email · password_hash (nullable) · username · fullname · role
                    google_id · auth_provider (email|google)
                    is_banned · is_flagged · is_admin · flags(jsonb) · created_at · last_active

profiles            user_id · interests[] · education · motive · targets · resume_ref
                    subscription_status · pro_expires_at
                    streak · xp · daily_energy_count · energy_reset_date
                    badges(jsonb) · last_streak_update

refresh_tokens      id · user_id · token_hash · expires_at

exercise_seeds      id · type · difficulty · payload(jsonb)
exercise_submissions id · user_id · seed_id · user_answer · is_correct · score · xp_awarded

audio_files         id · user_id · cloudinary_public_id · cloudinary_url
                    format · status(uploaded|processing|done|failed|archived)
                    context_type · archived_at
transcripts         id · audio_id · user_id · raw_text · segments · asr_confidence
                    feedback_json · schema_version

jobs                id · type · status · progress_pct · user_id · payload_ref
                    error_message · attempts

resumes             id · user_id · title · json_blob · cloudinary_public_id
                    cloudinary_url · file_format
resume_reports      id · resume_id · job_id · jd_text · cover_letter · analysis_type
                    report_json · score · status

interview_rooms     id · host_id · room_token · settings · status · start_ts · end_ts
                    audio_id · result_json
job_listings        id · title · company · location · job_type · description · url

games               id · type · difficulty · config(jsonb) · seed_json(jsonb) · is_active
game_scores         id · user_id · game_id · score · combo · hearts_left
                    time_taken_seconds · metadata(jsonb)

contests            id · creator_id · game_type · title · token · share_link
                    start_ts · end_ts · prize_info(jsonb) · settings(jsonb) · status
contest_participants id · contest_id · user_id · participant_token · score · rank
                    game_seed_id · certificate_url · joined_at

admin_actions       id · admin_id · action · target_type · target_id · metadata(jsonb)
promo_codes         id · code · discount_pct · max_uses · uses · grants_pro
                    pro_days · expires_at · created_by · is_active
promo_code_redemptions id · code_id · user_id · redeemed_at

exports             id · requested_by · export_type · file_url · status · error_message
```

---

## Rate Limiting

| Limiter | Endpoints | Window | Max |
|---|---|---|---|
| `authLimiter` | `/auth/signup`, `/auth/login`, `/auth/google` | 15 min | 10 req |
| `uploadLimiter` | `/audio/upload-init`, `/resumes/upload-init` | 15 min | 20 req |
| `scoringLimiter` | `/exercises/*`, `/games/*` | 1 min | 30 req |

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_GOOGLE_TOKEN` | 401 | Google ID token failed verification |
| `MISSING_SIGNUP_FIELDS` | 422 | New Google user missing `role` or `username` |
| `DUPLICATE_USERNAME` | 409 | Username already taken (Google signup) |
| `INVALID_TOKEN` | 401 | Missing or expired JWT |
| `INVALID_REFRESH_TOKEN` | 401 | Bad or expired refresh token |
| `ACCOUNT_BANNED` | 403 | User account is suspended |
| `FORBIDDEN` | 403 | Admin-only endpoint |
| `DUPLICATE_USER` | 409 | Email or username already in use |
| `VALIDATION_ERROR` | 400 | Joi schema failed |
| `INVALID_TYPE` | 400 | Unknown exercise or game type |
| `NOT_FOUND` | 404 | Route doesn't exist |
| `ENERGY_DEPLETED` | 402 | Daily exercise limit hit |
| `AUDIO_NOT_FOUND` | 404 | Audio file missing or wrong owner |
| `JOB_NOT_FOUND` | 404 | Job missing or wrong owner |
| `JOB_NOT_FAILED` | 400 | Retry attempted on non-failed job |
| `RESUME_NOT_FOUND` | 404 | Resume missing or wrong owner |
| `REPORT_NOT_FOUND` | 404 | Resume report missing or wrong owner |
| `ROOM_NOT_FOUND` | 404 | Interview room missing or wrong owner |
| `ROOM_ALREADY_ACTIVE` | 400 | Room already recording or completed |
| `ROOM_NOT_RECORDING` | 400 | Stop called on non-recording room |
| `ANSWER_REQUIRED` | 400 | Neither `answer_text` nor `audio_id` provided |
| `JD_TOO_SHORT` | 400 | Job description must be at least 50 characters |
| `CONTEST_NOT_FOUND` | 404 | Contest token not found |
| `CONTEST_NOT_ACTIVE` | 400 | Contest is not active (draft or completed) |
| `ALREADY_JOINED` | 409 | User already joined this contest |
| `NOT_A_PARTICIPANT` | 404 | Score submitted without joining |
| `ALREADY_COMPLETED` | 400 | Contest already completed |
| `USER_NOT_FOUND` | 404 | Admin target user not found |
| `ALREADY_BANNED` | 400 | User already banned |
| `NOT_BANNED` | 400 | Unban called on non-banned user |
| `SELF_DELETE` | 400 | Admin tried to delete own account |
| `BADGE_ALREADY_ASSIGNED` | 409 | Badge already on user profile |
| `BADGE_NOT_FOUND` | 404 | Badge not found on user profile |
| `NOT_PRO` | 400 | Revoke Pro called on free user |
| `PROMO_NOT_FOUND` | 404 | Promo code not found |
| `PROMO_INACTIVE` | 400 | Promo code deactivated |
| `PROMO_EXPIRED` | 400 | Promo code past expiry date |
| `PROMO_EXHAUSTED` | 400 | Promo code usage limit reached |
| `ALREADY_REDEEMED` | 409 | User already redeemed this code |
| `FILE_NOT_FOUND_ON_CLOUDINARY` | 400 | File not verifiable on Cloudinary |
| `AI_SERVICE_ERROR` | 502 | Gemini API failure |
| `AI_PARSE_ERROR` | 502 | Gemini returned malformed JSON |

---

## Security

- Passwords: **bcrypt (12 rounds)**
- Refresh tokens: stored as **bcrypt hashes** — raw token never persisted
- `password_hash` never returned in any API response
- `answer_key` stripped from all exercise and game seed responses
- Cloudinary uploads use **signed requests** — clients cannot bypass folder restrictions
- All SQL uses **parameterized statements** — no string interpolation
- Stack traces hidden in production (`NODE_ENV=production`)
- Rate limiting on all sensitive endpoints
- GDPR: `DELETE /users/me` purges all Cloudinary assets then hard-deletes the account
- Audio retention cron archives files older than 90 days to `kikoo/archive/` on Cloudinary

---

## Scripts

```bash
npm run dev           # Start with nodemon (hot reload)
npm start             # Start for production
npm run migrate       # Apply pending SQL migrations
npm run seed:all      # Seed everything (users + exercises + games + contests + resumes)
npm run seed:users    # Seed test users only
npm run seed:games    # Seed game data only
npm run smoke         # Run end-to-end smoke test (requires server running)
```

---

## Milestones

| Milestone | Status | Key Deliverables |
|---|---|---|
| **M1 — Foundation & English Learning** | ✅ Done | Auth (JWT + refresh), user + profile schema, XP/streak/badges, 9 exercise types, energy system, daily assignments |
| **M2 — Audio Pipeline & AI Feedback** | ✅ Done | Cloudinary direct upload, Gemini transcription, structured speaking feedback, in-process job queue, speaking evaluation |
| **M3 — Resume Tools & Interview** | ✅ Done | Resume upload (file + JSON), AI analyze + roast, ATS detection, mock interview rooms, per-question scoring, job listings |
| **M4 — Mini-Games & Contests** | ✅ Done | 5 game types, contest flow (create/join/leaderboard/score/complete), live rank recalc, Pro prize distribution, certificate PDF generation |
| **M5 — Admin, Security & Handover** | ✅ Done | Full admin API (18 endpoints), rate limiting, audio retention cron, GDPR delete, promo codes, job retry, CSV exports, OpenAPI spec, all seed files, smoke test |
| **M6 — Google OAuth (Mobile)** | ✅ Done | Google Sign-In ID token verification, new user creation, account linking for existing email users, `auth_provider` tracking, Postman collection updated, full Flutter + React Native setup guide |
| **M7 — Gamification & Energy Fixes** | ✅ Done | Contextooo semantic ranking via Gemini embeddings (`gemini-embedding-001`), exercise submit now returns `new_total_xp` + `streak_count`, energy auto-reset at midnight UTC (`energyResetJob`), stale energy fixed on all read paths (`/users/me`, `/assignments/daily`) |

---

## Frontend Guide

See [`FRONTEND_IMPLEMENTATION_GUIDE.md`](./FRONTEND_IMPLEMENTATION_GUIDE.md) for complete frontend integration including code snippets for every flow, Cloudinary upload helpers, token refresh interceptor, polling helpers, and flow diagrams.
