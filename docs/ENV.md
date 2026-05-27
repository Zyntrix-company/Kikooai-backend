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
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | Primary Gemini model for transcription, analysis, resumes, etc. Takes precedence over `AI_MODEL`. |
| `GEMINI_MODEL_FALLBACK` | No | `gemini-1.5-flash,gemini-2.0-flash` | Comma-separated fallbacks if the primary hits 429 / quota (paid key must have billing enabled in [Google AI Studio](https://aistudio.google.com)). |
| `GEMINI_LIVE_MODEL` | No | `gemini-2.5-flash-native-audio-preview-09-2025` | Gemini Live model used by the server-side live interview agent. |
| `GEMINI_ANALYSIS_MODEL` | No | `gemini-2.5-flash-preview-05-20` | Model metadata returned to clients for post-session interview analysis. |
| `GEMINI_EMBEDDING_MODEL` | No | `gemini-embedding-001` | Embedding model for Contextooo word ranking (`POST /games/contextooo/rank`). Replaces deprecated `text-embedding-004`. |
| `AI_MODEL` | No | `gemini-2.5-flash` | Legacy alias for `GEMINI_MODEL`. Checked if `GEMINI_MODEL` is unset. |
| `AI_API_KEY` | No | — | Legacy alias for `GEMINI_API_KEY`. Not actively used — set `GEMINI_API_KEY` instead. |

---

## LiveKit / Live Interview

| Variable | Required | Default | Description |
|---|---|---|---|
| `LIVEKIT_URL` | **Yes for live interviews** | — | LiveKit Cloud/self-hosted WebSocket URL returned to Flutter for WebRTC live interviews. |
| `LIVEKIT_API_KEY` | **Yes for live interviews** | — | LiveKit server API key used only by the backend to create rooms and scoped participant tokens. |
| `LIVEKIT_API_SECRET` | **Yes for live interviews** | — | LiveKit server API secret. Never expose this client-side. |
| `LIVE_INTERVIEW_AGENT_SECRET` | **Yes for agent callbacks** | — | Shared bearer token used by the media worker when calling internal agent status/completion endpoints. |
| `LIVE_INTERVIEW_AGENT_WEBHOOK_URL` | No | — | Optional URL for dispatching a separate LiveKit/Gemini media worker when a live interview starts. |

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
