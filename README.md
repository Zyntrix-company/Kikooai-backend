# KikooAI Backend

Production-ready REST API for the **KikooAI** English learning platform — powering exercises, XP progression, streaks, user profiles, and AI-assisted learning.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| Framework | Express.js v5 |
| Database | PostgreSQL via [Neon](https://neon.tech) (serverless) |
| Auth | JWT (access) + UUID refresh tokens (bcrypt-hashed) |
| Validation | Joi |
| File uploads | Cloudinary v2 |
| AI | Google Gemini (`@google/generative-ai`) |
| Process manager | Nodemon (dev) |

---

## Project Structure

```
src/
├── db/
│   ├── pool.js              # Singleton pg connection pool
│   └── migrate.js           # SQL migration runner
├── middleware/
│   ├── auth.js              # JWT Bearer verification → req.user
│   ├── adminGuard.js        # is_admin check (runs after auth)
│   ├── errorHandler.js      # Global 4-arg Express error handler
│   └── validate.js          # Joi request body validator factory
├── migrations/
│   ├── 001_users.sql        # users table + indexes
│   ├── 002_profiles.sql     # profiles + refresh_tokens tables
│   └── 003_exercises.sql    # exercise_seeds + exercise_submissions
├── routes/
│   ├── auth.js              # /auth/* and /users/me
│   └── exercises.js         # /exercises/*
├── services/
│   ├── authService.js       # All auth DB logic
│   └── exerciseService.js   # All exercise + energy + streak logic
├── seeds/
│   └── exercises.js         # Sample exercise data (idempotent)
├── utils/
│   ├── cloudinary.js        # Pre-configured Cloudinary v2 instance
│   ├── gemini.js            # Google Gemini model factory
│   ├── response.js          # success() / fail() response helpers
│   └── sanitize.js          # sanitizeUser() — strips password_hash
└── index.js                 # Entry point
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

Fill in the required values (see [Environment Variables](#environment-variables) below).

### 3. Run migrations

```bash
npm run migrate
```

Migrations are tracked in a `migrations_run` table. Each file runs in a transaction and is skipped if already applied.

### 4. Seed exercise data

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

Server starts on `PORT` (default `3000`).

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
| `AI_API_KEY` | ✅ | Google AI Studio API key (Gemini) |
| `AI_MODEL` | — | Gemini model ID (default: `gemini-1.5-flash`) |
| `ADMIN_SECRET` | ✅ | Secret for admin operations |
| `ENERGY_PER_MINUTE` | — | Energy rate (default: `1`) |
| `MIN_DAILY_ENERGY_FOR_STREAK` | — | Exercises needed for streak (default: `10`) |
| `AUDIO_ARCHIVE_AFTER_DAYS` | — | Days before audio archival (default: `90`) |
| `PORT` | — | Server port (default: `3000`) |
| `NODE_ENV` | — | `development` or `production` |

---

## API Reference

Base URL: `http://localhost:3000`
Authenticated routes require: `Authorization: Bearer <accessToken>`

All responses follow this envelope:

```json
{ "success": true,  "data": { ... } }
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

---

### Health

#### `GET /healthz`

No auth required. Returns server and database status.

**Response `200`**
```json
{
  "status": "ok",
  "db": "connected",
  "ts": "2026-03-20T08:00:00.000Z"
}
```

---

### Auth

#### `POST /api/v1/auth/signup`

Register a new user. Creates user + profile in a single transaction.

**Body**
```json
{
  "email": "user@kikoo.ai",
  "password": "password123",
  "username": "kikoouser",
  "fullname": "Kikoo User",
  "role": "student"
}
```

| Field | Rules |
|---|---|
| `email` | Valid email, unique |
| `password` | Min 8 characters |
| `username` | Alphanumeric, 3–30 chars, unique |
| `role` | `student` · `job_seeker` · `professional` |

**Response `201`**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "username": "...", "role": "student", ... },
    "accessToken": "eyJ...",
    "refreshToken": "uuid-v4"
  }
}
```

**Errors:** `409 DUPLICATE_USER` · `400 VALIDATION_ERROR`

---

#### `POST /api/v1/auth/login`

**Body**
```json
{ "email": "user@kikoo.ai", "password": "password123" }
```

**Response `200`** — same shape as signup.

**Errors:** `401 INVALID_CREDENTIALS` · `403 ACCOUNT_BANNED`

---

#### `POST /api/v1/auth/refresh`

Rotate the refresh token. Old token is deleted, new pair issued.

**Body**
```json
{ "refreshToken": "uuid-v4" }
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "new-uuid",
    "user": { ... }
  }
}
```

**Errors:** `401 INVALID_REFRESH_TOKEN`

---

#### `POST /api/v1/auth/logout` 🔒

Invalidates all refresh tokens for the authenticated user.

**Response `200`**
```json
{ "success": true, "data": { "message": "Logged out" } }
```

---

### User

#### `GET /api/v1/users/me` 🔒

Returns the authenticated user joined with their full profile.

**Response `200`**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@kikoo.ai",
      "username": "kikoouser",
      "fullname": "Kikoo User",
      "role": "student",
      "is_admin": false,
      "interests": [],
      "education": {},
      "motive": "",
      "targets": {},
      "subscription_status": "free",
      "streak": 0,
      "xp": 0,
      "daily_energy_count": 0,
      "badges": [],
      "last_streak_update": null
    }
  }
}
```

---

#### `PATCH /api/v1/users/me` 🔒

Update profile fields. All fields optional.

**Body** (any subset)
```json
{
  "interests": ["business english", "pronunciation"],
  "motive": "Improve professional communication",
  "education": { "level": "bachelor", "field": "Computer Science" },
  "targets": { "daily_minutes": 20, "target_score": "B2" },
  "resume_ref": null
}
```

**Response `200`**
```json
{ "success": true, "data": { "profile": { ... } } }
```

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

#### `GET /api/v1/exercises/:type/seed` 🔒

Fetch a random exercise for a given type and difficulty. `answer_key` and `acceptable_variants` are **never** returned to the client.

**Query params**

| Param | Values | Default |
|---|---|---|
| `difficulty` | `easy` · `medium` · `hard` | `medium` |

**Example**
```
GET /api/v1/exercises/fillup/seed?difficulty=easy
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "seed": {
      "id": "uuid",
      "type": "fillup",
      "difficulty": "easy",
      "payload": {
        "sentence": "She ___ to the market every morning.",
        "blank_count": 1,
        "explanation": "'Goes' is correct because...",
        "hints": ["Think about subject-verb agreement.", "The subject is 'She'."]
      }
    }
  }
}
```

**Errors:** `404 NOT_FOUND` · `400 INVALID_TYPE` · `400 INVALID_DIFFICULTY`

---

#### `POST /api/v1/exercises/:type/submit` 🔒

Submit an answer. Consumes 1 energy, awards XP, and updates streak.

**Body**
```json
{
  "seed_id": "uuid",
  "user_answer": "goes",
  "audio_id": "uuid (optional)"
}
```

For `vocab`, `synonyms`, `antonyms` — pass the option ID as `user_answer`:
```json
{ "seed_id": "uuid", "user_answer": "a" }
```

**Scoring**

| Result | Base Score | Easy | Medium | Hard |
|---|---|---|---|---|
| Correct | 100 | 100 | 150 | 200 |
| Wrong | 0 | 0 | 0 | 0 |

XP awarded = `score × 0.1` (minimum 1 per attempt).

**Response `200`**
```json
{
  "success": true,
  "data": {
    "is_correct": true,
    "score": 100,
    "xp_awarded": 10,
    "explanation": "'Goes' is correct because the subject is third-person singular.",
    "hints": ["Think about subject-verb agreement."]
  }
}
```

**Response `402` — Energy depleted**
```json
{
  "error": "Daily energy depleted. Resets at midnight UTC.",
  "code": "ENERGY_DEPLETED",
  "resets_at": "2026-03-21T00:00:00.000Z"
}
```

---

#### `GET /api/v1/exercises/speaking/prompt` 🔒

Returns a speaking prompt matched to the user's current level.

| XP Range | CEFR Level | Difficulty |
|---|---|---|
| 0 – 300 | A1 / A2 | easy |
| 301 – 1500 | B1 / B2 | medium |
| 1501+ | C1 | hard |

Falls back to `medium` if no prompts exist for the target difficulty.

---

## Energy & Streak System

### Daily Energy
- Each submitted exercise costs **1 energy**
- Maximum **50 exercises** per day
- Energy resets at **midnight UTC**
- Exceeding the limit returns `402 ENERGY_DEPLETED` with `resets_at` timestamp

### Streak
- A streak day is counted when `daily_energy_count ≥ MIN_DAILY_ENERGY_FOR_STREAK` (default: 10)
- Only one streak increment per calendar day
- Bonus XP on streak increment: `streak × 5`

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
  role · is_banned · is_flagged · is_admin
  created_at · last_active

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
```

---

## Postman Collection

Import `KikooAI.postman_collection.json` from the project root.

The collection:
- Auto-saves `accessToken` and `refreshToken` after Login/Signup
- Auto-saves `seedId` after fetching a seed (for submit tests)
- Includes example responses for every endpoint
- Has test scripts that verify security invariants (no `password_hash` exposed, `answer_key` stripped)

---

## Scripts

```bash
npm run dev       # Start with nodemon (hot reload)
npm start         # Start for production
npm run migrate   # Run pending SQL migrations
node src/seeds/exercises.js   # Seed sample exercise data
```

---

## Security Notes

- Passwords hashed with **bcrypt (12 rounds)**
- Refresh tokens stored as **bcrypt hashes (10 rounds)** — raw token never persisted
- `password_hash` is **never** returned in any API response
- `answer_key` and `acceptable_variants` are **stripped** from all seed responses
- Stack traces are **hidden in production** (`NODE_ENV=production`)
- All SQL queries use **parameterized statements** — no string interpolation
