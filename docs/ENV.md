# Environment Variable Reference

All variables read by the Kikooai backend, grouped by service. Copy `.env.example` (if present) and fill in the values before starting.

---

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (e.g. `postgres://user:pass@host/db?sslmode=require`). Used by `src/db/pool.js`. |
| `JWT_SECRET` | **Yes** | — | Secret key for signing access tokens. Use a long, random string (32+ chars). |
| `JWT_EXPIRY` | **Yes** | — | Access token lifetime accepted by `jsonwebtoken` (e.g. `15m`, `1h`). |
| `REFRESH_TOKEN_EXPIRY` | **Yes** | — | Refresh token lifetime in seconds (integer, e.g. `604800` = 7 days). |
| `PORT` | No | `3000` | HTTP port the Express server listens on. |
| `NODE_ENV` | No | `development` | Runtime environment label. Set to `production` on Render. |

---

## Cloudinary

| Variable | Required | Default | Description |
|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | **Yes** | — | Your Cloudinary cloud name (from the dashboard). |
| `CLOUDINARY_API_KEY` | **Yes** | — | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | **Yes** | — | Cloudinary API secret. Never expose client-side. |
| `CLOUDINARY_AUDIO_FOLDER` | No | `kikoo/audio` | Cloudinary folder prefix where audio uploads are stored. Used when constructing public IDs for the retention cron. |

---

## AI / Gemini

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Google Generative AI API key. Used by `src/services/geminiService.js` for all AI features (resume analysis, transcription, interview prep). |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Override the Gemini model name (e.g. `gemini-1.5-pro`). Takes precedence over `AI_MODEL`. |
| `AI_MODEL` | No | `gemini-2.0-flash` | Legacy alias for `GEMINI_MODEL`. Checked if `GEMINI_MODEL` is unset. |
| `AI_API_KEY` | No | — | Legacy alias for `GEMINI_API_KEY`. Not actively used — set `GEMINI_API_KEY` instead. |

---

## Jobs / Background Processing

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUDIO_RETENTION_DAYS` | No | `90` | Audio files older than this many days are moved to `kikoo/archive/` on Cloudinary and marked `archived` in the DB. Set to `0` to disable archiving. |

---

## App

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_BASE_URL` | No | — | Public base URL of the backend (e.g. `https://kikooai-backend.onrender.com`). Used to build `share_link` for contests. Falls back to a relative path if unset. |
| `MIN_DAILY_ENERGY_FOR_STREAK` | No | `1` | Minimum energy points a user must earn in a day to count the day as an active streak day. |

---

## Render / Deployment Notes

- Set all **Required** vars in the Render dashboard under **Environment** before the first deploy.
- `DATABASE_URL` should include `?sslmode=require` when connecting to Neon serverless.
- Never commit `.env` to git. The `.gitignore` should already exclude it.
- `GEMINI_MODEL` is the recommended override if Google deprecates the default model — no code change needed.
