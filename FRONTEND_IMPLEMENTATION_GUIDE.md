# KikooAI — Frontend Implementation Guide

Complete reference for integrating the KikooAI backend into any frontend (React, Next.js, Vue, React Native, Flutter, etc.).

---

## Table of Contents

1. [Setup & Configuration](#1-setup--configuration)
2. [Auth & Token Management](#2-auth--token-management)
3. [User Profile](#3-user-profile)
4. [Text Exercises](#4-text-exercises)
5. [Daily Assignments](#5-daily-assignments)
6. [Audio Recording & Speaking Feedback](#6-audio-recording--speaking-feedback)
7. [Resume Upload (File)](#7-resume-upload-file)
8. [Resume as JSON](#8-resume-as-json)
9. [Resume Analysis & Roast](#9-resume-analysis--roast)
10. [Interview Rooms](#10-interview-rooms)
11. [Quick Question Evaluator](#11-quick-question-evaluator)
12. [Mini-Games](#12-mini-games)
13. [Contests](#13-contests)
14. [Promo Codes](#14-promo-codes)
15. [Admin Panel](#15-admin-panel)
16. [Job Status Polling](#16-job-status-polling)
17. [Error Handling Reference](#17-error-handling-reference)
18. [Response Envelope](#18-response-envelope)
19. [Flow Diagrams](#19-flow-diagrams)

---

## 1. Setup & Configuration

**Production base URL:** `https://kikooai-backend.onrender.com`
**Dev base URL:** `http://localhost:3000`

```env
# .env.local (Next.js) or equivalent
NEXT_PUBLIC_API_BASE_URL=https://kikooai-backend.onrender.com
```

### Base API helper

```js
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(json?.error || 'Request failed'), { code: json?.code, status: res.status });
  return json.data;
}
```

---

## 2. Auth & Token Management

### Signup

```js
const data = await api('POST', '/auth/signup', {
  email:    'user@example.com',
  password: 'password123',     // min 8 chars
  username: 'myusername',      // alphanumeric, 3–30 chars
  fullname: 'Jane Doe',
  role:     'student',         // student | job_seeker | professional
});
// data: { user, accessToken, refreshToken }
localStorage.setItem('accessToken',  data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);
```

### Login

```js
const data = await api('POST', '/auth/login', { email, password });
// data: { user, accessToken, refreshToken }
```

### Logout

```js
await api('POST', '/auth/logout', null, accessToken);
localStorage.clear();
```

### Token refresh interceptor (Axios)

Access tokens expire in **15 minutes**. Wire this up once at app startup:

```js
import axios from 'axios';

axios.interceptors.response.use(null, async (error) => {
  if (error.response?.status === 401 && !error.config._retry) {
    error.config._retry = true;
    try {
      const { data } = await axios.post('/api/v1/auth/refresh', {
        refreshToken: localStorage.getItem('refreshToken'),
      });
      localStorage.setItem('accessToken',  data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      error.config.headers['Authorization'] = `Bearer ${data.data.accessToken}`;
      return axios(error.config);
    } catch {
      // Refresh failed — redirect to login
      localStorage.clear();
      window.location.href = '/login';
    }
  }
  return Promise.reject(error);
});
```

### GDPR — Delete account

```js
await api('DELETE', '/users/me', null, accessToken);
// Deletes all Cloudinary assets (audio, resumes) then hard-deletes the DB row + all linked data
```

---

## 3. User Profile

### Get current user

```js
const { user } = await api('GET', '/users/me', null, accessToken);
// user.profile: { xp, streak, daily_energy_count, badges, subscription_status, pro_expires_at }
```

### Update profile

```js
await api('PATCH', '/users/me', {
  interests:  ['backend', 'system design'],
  education:  { degree: 'B.Tech', year: 2022 },
  motive:     'Land a FAANG backend role',
  targets:    { company: 'Google', role: 'SWE II' },
  resume_ref: 'uuid-of-resume',   // optional — links profile to a resume
}, accessToken);
// All fields optional — send only what changed
```

---

## 4. Text Exercises

### Get a random seed

```js
const { seed } = await api('GET', `/exercises/${type}/seed?difficulty=medium`, null, accessToken);
// seed: { id, type, difficulty, payload: { sentence, options, ... } }
// answer_key is never included — server-side only
```

**Types:** `fillup` · `jumbled_word` · `jumbled_sentence` · `vocab` · `synonyms` · `antonyms` · `pronunciation_spelling` · `grammar_transform` · `typing_from_audio`

### Submit an answer

```js
const result = await api('POST', `/exercises/${type}/submit`, {
  seed_id:     seed.id,
  user_answer: 'walks',
}, accessToken);
// result: { is_correct, score, xp_awarded, explanation, hints }
```

**Energy depleted (402):**
```js
try {
  await api('POST', '/exercises/fillup/submit', body, token);
} catch (err) {
  if (err.code === 'ENERGY_DEPLETED') {
    // err.status === 402
    // Show: "Come back after midnight UTC" with resets_at from the response body
  }
}
```

### Speaking exercise

```js
// 1. Get a speaking prompt matched to user CEFR level
const { seed } = await api('GET', '/exercises/speaking/prompt', null, accessToken);

// 2. Record audio and upload (see Section 6)

// 3. Evaluate (requires transcription to be done first)
const result = await api('POST', '/exercises/speaking/evaluate', {
  audio_id:  audioId,
  prompt_id: seed.id,
}, accessToken);
// result: { score, xp_awarded, feedback: { pronunciation, vocabulary, grammar, fluency, overall_score, level } }
```

---

## 5. Daily Assignments

Returns 6 exercises personalised to the user's XP level (answer_key stripped).

```js
const data = await api('GET', '/assignments/daily', null, accessToken);
// data.level:       { xp, cefr, difficulty, daily_energy_used }
// data.assignments: [{ type, seed: { id, type, difficulty, payload } }, ...]
// data.progress:    { completed_today, total }
```

**XP → difficulty:** ≤300 = easy (A1/A2) · ≤1500 = medium (B1/B2) · >1500 = hard (C1/C2)

Submit each assignment via `POST /exercises/:type/submit` using the seed's `id`.

```jsx
// React example
const { assignments } = await api('GET', '/assignments/daily', null, token);

assignments.forEach(({ type, seed }) => {
  // Render each exercise by type
  // On submit: api('POST', `/exercises/${type}/submit`, { seed_id: seed.id, user_answer }, token)
});
```

---

## 6. Audio Recording & Speaking Feedback

The audio **never passes through the backend** — the client uploads directly to Cloudinary.

```
Step 1: POST /audio/upload-init    → get Cloudinary signature
Step 2: POST to Cloudinary         → direct browser/mobile upload
Step 3: POST /audio/complete       → confirm upload, enqueue transcription
Step 4: Poll GET /jobs/:id         → wait for transcription
Step 5: GET /audio/:id/transcript  → fetch result
```

### Step 1 — Get upload signature

```js
const { upload_id, cloudinary } = await api('POST', '/audio/upload-init', {
  filename:         'recording.webm',
  format:           'webm',              // webm | mp4 | mp3 | wav | ogg | m4a
  context_type:     'speaking',          // speaking | interview | speed_reading
  duration_seconds: 45,
}, accessToken);
```

### Step 2 — Upload to Cloudinary directly

```js
const formData = new FormData();
formData.append('file',         audioBlob);
formData.append('signature',    cloudinary.signature);
formData.append('timestamp',    String(cloudinary.timestamp));
formData.append('api_key',      cloudinary.apiKey);
formData.append('folder',       cloudinary.folder);
formData.append('resource_type', 'video');  // Cloudinary uses 'video' for audio files

const clRes = await fetch(cloudinary.uploadUrl, { method: 'POST', body: formData });
const { public_id, secure_url } = await clRes.json();
```

### Step 3 — Confirm upload

```js
const { audio_id, job_id } = await api('POST', '/audio/complete', {
  upload_id:            upload_id,
  cloudinary_public_id: public_id,
  cloudinary_url:       secure_url,
  format:               'webm',
  duration_seconds:     45,
  prompt_text:          'Describe your morning routine.',  // optional
}, accessToken);
```

### Steps 4 & 5 — Poll then fetch

```js
await pollJob(job_id, accessToken);  // see Section 16

const { transcript, feedback } = await api('GET', `/audio/${audio_id}/transcript`, null, accessToken);
// feedback: { pronunciation, vocabulary, grammar, fluency, filler_words, overall_score, cefr_level }
```

---

## 7. Resume Upload (File)

For PDF, DOCX, or TXT resumes. Same 3-step Cloudinary pattern as audio.

### Step 1 — Get upload signature

```js
const { resume_id, cloudinary } = await api('POST', '/resumes/upload-init', null, accessToken);
// cloudinary.uploadUrl targets /raw/upload (not /video/upload)
```

### Step 2 — Upload to Cloudinary

```js
const formData = new FormData();
formData.append('file',      pdfFile);   // File object from <input type="file">
formData.append('signature', cloudinary.signature);
formData.append('timestamp', String(cloudinary.timestamp));
formData.append('api_key',   cloudinary.apiKey);
formData.append('folder',    cloudinary.folder);
// No resource_type needed — URL already targets /raw/upload

const clRes = await fetch(cloudinary.uploadUrl, { method: 'POST', body: formData });
const { public_id, secure_url, format } = await clRes.json();
```

### Step 3 — Confirm upload

```js
const { resume } = await api('POST', '/resumes/upload-complete', {
  resume_id:            resume_id,
  cloudinary_public_id: public_id,
  cloudinary_url:       secure_url,
  format:               'pdf',           // pdf | docx | txt
  title:                'My Resume',     // optional
}, accessToken);
// resume: { id, title, file_format, cloudinary_url, created_at }
```

### View / download the file

After upload you can let the user preview or download the file. The backend generates a **10-minute signed Cloudinary URL** (works regardless of CDN access restrictions):

```js
const { url, format, expires_in_seconds } = await api(
  'GET', `/resumes/${resumeId}/file`, null, accessToken
);
// Open the signed URL in a browser tab / WebView
window.open(url, '_blank');
```

> **Note:** The URL expires in 600 seconds. Fetch a fresh one each time the user wants to view the file — do not cache it.

---

## 8. Resume as JSON

For form-based resume builders — no file upload needed.

```js
const { resume } = await api('POST', '/resumes/save-json', {
  title:    'My Software Engineer Resume',
  json_blob: {
    name:       'Jane Doe',
    email:      'jane@example.com',
    experience: [{ role: 'Backend Developer', company: 'Acme', years: 3 }],
    skills:     ['Node.js', 'PostgreSQL', 'Docker'],
    education:  [{ degree: 'B.Tech Computer Science', year: 2022 }],
  },
}, accessToken);
// resume.id → use for analyze/roast
```

### List & delete resumes

```js
const { resumes } = await api('GET', '/resumes', null, accessToken);  // newest 20
await api('DELETE', `/resumes/${resumeId}`, null, accessToken);        // cascades to reports
```

> File resumes also have the `/file` endpoint — see [Section 7](#7-resume-upload-file) for usage.

---

## 9. Resume Analysis & Roast

### Trigger analysis

```js
// Analyze (professional feedback)
const { report_id, job_id } = await api('POST', '/resumes/analyze', {
  resume_id:    resumeId,
  jd_text:      'We are looking for a backend developer with 2+ years...', // min 50 chars
  cover_letter: 'Dear Hiring Manager...',  // optional
}, accessToken);

// Roast (same structure + witty roast_lines)
const { report_id, job_id } = await api('POST', '/resumes/roast', {
  resume_id: resumeId,
  jd_text:   'We are looking for...',
}, accessToken);
```

Both return **202** — the analysis runs as a background job.

### Poll the report

```js
async function pollReport(reportId, token, maxWait = 120_000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const data = await api('GET', `/resumes/reports/${reportId}`, null, token);
    if (data.status === 'done')   return data;   // data.report has full JSON
    if (data.status === 'failed') throw new Error('Analysis failed');
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Timed out');
}
```

**Report shape (on `status === 'done'`):**
```js
{
  status: 'done',
  score: 78,
  analysis_type: 'analyze',  // or 'roast'
  report: {
    strengths:          ['Strong Node.js experience', ...],
    ats_issues:         [{ issue, severity, fix }, ...],
    suggested_bullets:  [{ section, original, improved }, ...],
    improvement_steps:  [{ step, priority }, ...],
    keywords_missing:   ['Docker', 'CI/CD'],
    keywords_matched:   ['Node.js', 'PostgreSQL'],
    score:              78,
    score_breakdown:    { relevance, formatting, impact, ats_compatibility },
    summary:            'Strong technical foundation but...',
    roast_lines:        ['Your experience section reads like a job description...'],
  }
}
```

---

## 10. Interview Rooms

### Full live interview flow

```
POST /interview/rooms/create          → room_id
POST /interview/rooms/:id/record/start
[Record audio + upload via audio pipeline]
POST /interview/rooms/:id/record/stop  { audio_id }  → job_id
Poll GET /jobs/:job_id
GET  /interview/rooms/:id/result
```

### Gemini Live flow (client-side AI)

```
GET /interview/config    → { gemini_api_key, live_model, voices }
GET /interview/questions?role=Backend+Developer&round=Technical&difficulty=Medium
[Run Gemini Live session entirely client ↔ Gemini — backend not involved]
POST /interview/rooms/:id/save-report  { transcript, report }
GET  /interview/rooms/:id/result
```

### Create a room

```js
const { room_id, settings } = await api('POST', '/interview/rooms/create', {
  duration_mins: 30,
  job_role:      'Backend Developer',
  company:       'Google',
  difficulty:    'medium',
  questions: [
    { question_text: 'Tell me about yourself.' },
    { question_text: 'Describe a challenging bug you resolved.' },
  ],
}, accessToken);
```

### Start + stop recording

```js
await api('POST', `/interview/rooms/${room_id}/record/start`, null, accessToken);

// ... user records audio using the audio upload flow (context_type: 'interview') ...

const { job_id } = await api('POST', `/interview/rooms/${room_id}/record/stop`, {
  audio_id: audioId,
}, accessToken);

await pollJob(job_id, accessToken);  // see Section 16
```

### Save Gemini Live report

```js
await api('POST', `/interview/rooms/${room_id}/save-report`, {
  transcript: [
    { role: 'Dr. Emma', text: 'Tell me about yourself.' },
    { role: 'You',      text: 'I am a backend developer with 3 years...' },
  ],
  report: {
    score:              78,
    feedback:           'Strong technical answers.',
    strengths:          ['Clear articulation'],
    improvements:       ['More detail on system design'],
    technicalAccuracy:  'Strong',
    communicationStyle: 'Confident',
  },
}, accessToken);
```

### Fetch result

```js
const { status, result } = await api('GET', `/interview/rooms/${room_id}/result`, null, accessToken);
// result: { transcript, overall_score, summary, question_results: [{ question, feedback }] }
```

### Get AI-generated questions

```js
const { questions } = await api(
  'GET',
  '/interview/questions?role=Backend+Developer&round=Technical&difficulty=Medium',
  null,
  accessToken
);
// questions: [{ question, difficulty, category }]  — 12 questions, cached 1h
```

---

## 11. Quick Question Evaluator

Evaluate any question + answer instantly — no room needed (great for browser extensions).

```js
const { overall_score, feedback } = await api('POST', '/interview/questions/evaluate', {
  question_text: 'Explain the difference between SQL and NoSQL.',
  answer_text:   'SQL uses structured schemas with ACID guarantees...',
  job_role:      'Backend Developer',
}, accessToken);

// feedback: {
//   relevance_score, communication_score, structure_score,
//   star_method_used, confidence_indicators,
//   strengths, improvements, model_answer_outline,
//   overall_score, one_line_verdict
// }
```

Alternatively pass `audio_id` (must be transcribed already) instead of `answer_text`.

---

## 12. Mini-Games

All 5 game types use the same 2-step pattern.

### Step 1 — Get a seed

```js
const { game } = await api('GET', `/games/${type}/seed`, null, accessToken);
// game: { id, type, difficulty, config, seed_json }
// answer_key is NEVER in seed_json — stripped server-side
```

**Types:** `conexo` · `speed_reading` · `contextooo` · `word_blitz` · `guess_the_word`

### Step 2 — Submit score

```js
const { saved, rank } = await api('POST', `/games/${type}/score`, {
  game_id:            game.id,
  score:              1500,
  combo:              3,        // optional
  hearts_left:        2,        // optional
  time_taken_seconds: 45,       // optional
  metadata:           {},       // optional — any extra game state
}, accessToken);
// rank: user's position among all scores for this game seed
```

### seed_json shapes per game type

**conexo:**
```js
seed_json: {
  groups:      [{ category, words: [] }],
  mixed_words: ['apple', 'red', 'lion', ...],  // all 16 words shuffled
  // NO answer_key
}
```

**speed_reading:**
```js
seed_json: {
  text:       'The Amazon rainforest...',
  word_count: 95,
  // NO answer_key
}
config: { time_seconds: 60 }
```

**contextooo:**
```js
seed_json: {
  hint:        'The nearest star to Earth',
  max_guesses: 10,
  // NO secret_word or answer_key
}
```

**word_blitz:**
```js
seed_json: {
  letters:      ['A', 'T', 'E', 'S', 'R', 'P'],
  time_seconds: 60,
  lives:        3,
  // NO valid_words or answer_key — validate guesses client-side against a dictionary
}
```

**guess_the_word:**
```js
seed_json: {
  hint:         'Large land animal with a trunk',
  letter_count: 8,
  max_guesses:  6,
  // NO word or answer_key
}
```

---

## 13. Contests

### Browse active contests

```js
const contests = await api('GET', '/contests', null, accessToken);
// contests: [{ id, title, game_type, token, share_link, start_ts, end_ts, prize_info, participant_count }]
```

### Join a contest

Users join via the share link token (deep link: `APP_BASE_URL/contests/:token`).

```js
const data = await api('POST', `/contests/${token}/join`, null, accessToken);
// data: {
//   contest_id, contest_title, share_link,
//   participant_token,
//   game_seed: { /* same as /games/:type/seed — answer_key stripped */ }
// }
// NOTE: joining never deducts energy
```

Handle the 409 if the user has already joined:
```js
try {
  await api('POST', `/contests/${token}/join`, null, token);
} catch (err) {
  if (err.code === 'ALREADY_JOINED') { /* show re-join screen or go to leaderboard */ }
}
```

### Submit a contest score

```js
const { leaderboard, my_rank, my_score } = await api('POST', `/contests/${token}/score`, {
  score:    2400,
  metadata: { time_taken: 38 },  // optional
}, accessToken);
// Score only updates if higher than your current best (GREATEST logic)
// Ranks are recalculated immediately after every submission
```

### Live leaderboard

Poll this every few seconds during an active contest:

```js
const { leaderboard, my_rank, my_score, contest_status } = await api(
  'GET', `/contests/${token}/leaderboard`, null, accessToken
);

// leaderboard entry shape:
// { rank, score, user_id, username, fullname, joined_at, certificate_url }
// certificate_url is null until admin completes contest — non-null for rank-1 winners
```

### Displaying a certificate

After a contest is completed, rank-1 winners have a `certificate_url` in the leaderboard. Render it as a download link or an embedded iframe:

```jsx
{entry.certificate_url && (
  <a href={entry.certificate_url} target="_blank" rel="noreferrer">
    Download Certificate
  </a>
)}
```

### Contest share link

When creating (admin flow) or after joining, the `share_link` is the deep link to send to other players. On your frontend, parse the token from the URL and call the join endpoint.

---

## 14. Promo Codes

Any authenticated user can redeem a code:

```js
const result = await api('POST', '/promo-codes/redeem', { code: 'WELCOME30' }, accessToken);
// result: { redeemed, discount_pct, grants_pro, pro_days, code }

if (result.grants_pro) {
  // User's subscription_status is now 'pro' — re-fetch /users/me to reflect
}
```

**Error codes to handle:**

| Code | Meaning |
|---|---|
| `PROMO_NOT_FOUND` | Code doesn't exist |
| `PROMO_INACTIVE` | Code disabled by admin |
| `PROMO_EXPIRED` | Past expiry date |
| `PROMO_EXHAUSTED` | Max uses reached |
| `ALREADY_REDEEMED` | User already used this code |

---

## 15. Admin Panel

All admin endpoints require a user with `is_admin = true`. Include the admin's `accessToken` the same way.

### User management

```js
// List users (paginated, searchable)
const { users, total } = await api('GET', '/admin/users?search=john&limit=20&offset=0', null, adminToken);

// Full user detail
const { user } = await api('GET', `/admin/users/${userId}`, null, adminToken);
// user.stats: { exercise_submissions, audio_files, resumes }

// Ban / unban
await api('POST', `/admin/users/${userId}/ban`,   { reason: 'Spam' }, adminToken);
await api('POST', `/admin/users/${userId}/unban`,  null,              adminToken);

// Flag
await api('POST', `/admin/users/${userId}/flag`, { reason: 'Suspicious activity' }, adminToken);

// Delete (cannot delete self)
await api('DELETE', `/admin/users/${userId}`, null, adminToken);
```

### Badges & subscriptions

```js
await api('POST', `/admin/users/${userId}/badges/assign`, { badge_id: 'top_player', badge_name: 'Top Player' }, adminToken);
await api('POST', `/admin/users/${userId}/badges/remove`, { badge_id: 'top_player' }, adminToken);

await api('POST', `/admin/users/${userId}/grant-pro`, { days: 30 }, adminToken);
await api('POST', `/admin/users/${userId}/revoke-pro`, null, adminToken);
```

### Promo code management

```js
// Create
await api('POST', '/admin/promo-codes', {
  code:         'SUMMER25',
  discount_pct: 25,
  max_uses:     100,
  grants_pro:   true,
  pro_days:     30,
  expires_at:   '2026-09-01T00:00:00Z',
}, adminToken);

// List
const { promos } = await api('GET', '/admin/promo-codes', null, adminToken);

// Toggle active/inactive
await api('PATCH', `/admin/promo-codes/${codeId}`, null, adminToken);
```

### Logs & job retry

```js
// Job logs
const { logs, total } = await api('GET', '/admin/logs?status=failed&type=transcription', null, adminToken);

// Retry a failed job
await api('POST', `/admin/jobs/${jobId}/retry`, null, adminToken);
```

### CSV exports

```js
// Trigger export (fire-and-forget, returns immediately)
const { export_id } = await api('POST', '/admin/export', {
  export_type: 'users',  // users | transcripts | contest_results | game_scores
}, adminToken);
// status: 'pending' initially

// Poll exports list for status + download URL
const { exports } = await api('GET', '/admin/exports', null, adminToken);
const ready = exports.find(e => e.id === export_id && e.status === 'done');
if (ready) window.open(ready.file_url);
```

### Contest control

```js
// Create a contest (admin only)
const contest = await api('POST', '/contests', {
  title:      'April Speed Reading Championship',
  game_type:  'speed_reading',
  start_ts:   '2026-04-15T10:00:00Z',
  end_ts:     '2026-04-22T10:00:00Z',
  prize_info: { prize_type: 'pro', pro_days: 30 },
  settings:   { randomize_seed: false },
}, adminToken);
// contest.share_link is ready to share immediately

// Complete and distribute prizes
await api('POST', `/contests/${contest.token}/complete`, null, adminToken);
// Rank-1 winners get Pro subscription + certificate PDF uploaded to Cloudinary
```

---

## 16. Job Status Polling

All async AI tasks (transcription, resume analysis, interview scoring, export) use the same pattern.

### Polling endpoint

```
GET /api/v1/jobs/:job_id
Authorization: Bearer <accessToken>
```

```js
// data: { id, status, progress_pct, error_message, updated_at }
// status: pending → processing → done | failed
```

### Generic polling helper

```js
async function pollJob(jobId, token, { interval = 2000, timeout = 120_000, onProgress } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const data = await api('GET', `/jobs/${jobId}`, null, token);
    if (onProgress) onProgress(data.progress_pct);
    if (data.status === 'done')   return data;
    if (data.status === 'failed') throw new Error(data.error_message || 'Job failed');
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Job timed out after ' + timeout / 1000 + 's');
}

// Usage with progress bar:
await pollJob(jobId, token, {
  onProgress: (pct) => setProgressBar(pct),
});
```

### List all jobs

```js
const { jobs } = await api('GET', '/jobs', null, accessToken);
// jobs: [{ id, type, status, progress_pct, error_message, created_at }]
```

---

## 17. Error Handling Reference

All errors follow this shape:
```json
{ "success": false, "error": "Human-readable message", "code": "ERROR_CODE" }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Joi validation failed |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_TOKEN` | 401 | JWT missing, malformed, or expired |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token invalid or expired |
| `ACCOUNT_BANNED` | 403 | User is suspended |
| `FORBIDDEN` | 403 | Admin-only endpoint accessed by non-admin |
| `DUPLICATE_USER` | 409 | Email or username already in use |
| `ENERGY_DEPLETED` | 402 | Daily exercise limit hit |
| `AUDIO_NOT_FOUND` | 404 | Audio missing or wrong owner |
| `JOB_NOT_FOUND` | 404 | Job missing or wrong owner |
| `RESUME_NOT_FOUND` | 404 | Resume missing or wrong owner |
| `RESUME_NO_FILE` | 400 | Resume exists but has no uploaded file (JSON-only resume) |
| `REPORT_NOT_FOUND` | 404 | Resume report missing or wrong owner |
| `ROOM_NOT_FOUND` | 404 | Interview room missing or wrong owner |
| `ROOM_ALREADY_ACTIVE` | 400 | Room already recording or completed |
| `ROOM_NOT_RECORDING` | 400 | Stop called on non-recording room |
| `ANSWER_REQUIRED` | 400 | Neither `answer_text` nor `audio_id` provided |
| `JD_TOO_SHORT` | 400 | `jd_text` must be at least 50 characters |
| `CONTEST_NOT_FOUND` | 404 | Contest token not found |
| `CONTEST_NOT_ACTIVE` | 400 | Contest is not active |
| `ALREADY_JOINED` | 409 | User already joined this contest |
| `NOT_A_PARTICIPANT` | 404 | Score submitted without joining |
| `PROMO_NOT_FOUND` | 404 | Promo code not found |
| `PROMO_INACTIVE` | 400 | Promo code disabled |
| `PROMO_EXPIRED` | 400 | Promo code past expiry |
| `PROMO_EXHAUSTED` | 400 | Promo code usage limit reached |
| `ALREADY_REDEEMED` | 409 | User already used this code |
| `FILE_NOT_FOUND_ON_CLOUDINARY` | 400 | File not verifiable on Cloudinary |
| `AI_SERVICE_ERROR` | 502 | Gemini API failure |
| `AI_PARSE_ERROR` | 502 | Gemini returned malformed JSON |
| `RATE_LIMITED` | 429 | Too many requests (see rate limits) |

### Rate limits to handle on the frontend

| Endpoint group | Limit | Window |
|---|---|---|
| `/auth/signup`, `/auth/login` | 10 requests | 15 minutes |
| `/audio/upload-init`, `/resumes/upload-init` | 20 requests | 15 minutes |
| `/exercises/*`, `/games/*` | 30 requests | 1 minute |

On **429** show a friendly cooldown message, not a generic error.

---

## 18. Response Envelope

Every endpoint uses this consistent structure:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

- **201** — Resource created (signup, contest join)
- **202** — Accepted, processing async (resume analyze, audio complete, export trigger)
- **200** — Everything else success

---

## 19. Flow Diagrams

### Audio → Transcription

```
POST /audio/upload-init
        │ { upload_id, cloudinary }
        ▼
POST to cloudinary.uploadUrl (browser → Cloudinary, no backend)
        │ { public_id, secure_url }
        ▼
POST /audio/complete  { upload_id, cloudinary_public_id, ... }
        │ { audio_id, job_id }  ← 202
        ▼
Poll GET /jobs/:job_id  every 2s
        │ status = done
        ▼
GET /audio/:audio_id/transcript
        │
        ▼ Display feedback
```

### Resume Analysis

```
[File upload] POST /resumes/upload-init
              → upload to Cloudinary
              → POST /resumes/upload-complete  → resume_id
              → GET /resumes/:resume_id/file   → signed URL (view/download, 10 min TTL)
[JSON upload] POST /resumes/save-json          → resume_id
        │
        ▼
POST /resumes/analyze  (or /roast)  { resume_id, jd_text }
        │ { report_id, job_id }  ← 202
        ▼
Poll GET /jobs/:job_id
        │ status = done
        ▼
GET /resumes/reports/:report_id
        │
        ▼ Display score + feedback
```

### Contest Flow

```
[Admin] POST /contests  { title, game_type, prize_info }
        │ { token, share_link }
        ▼
[Users] Share link distributed: APP_BASE_URL/contests/:token
        │
        ▼
POST /contests/:token/join
        │ { participant_token, game_seed }
        ▼
Play game using game_seed (client-side)
        │
        ▼
POST /contests/:token/score  { score }
        │ { leaderboard, my_rank }
        ▼ (poll during contest)
GET /contests/:token/leaderboard  every 5–10s
        │
[Admin] POST /contests/:token/complete
        │ Grants Pro to rank-1 winners
        │ Generates + uploads PDF certificate
        ▼
GET /contests/:token/leaderboard
  → winners have certificate_url populated
```

### Interview (Audio Scored)

```
POST /interview/rooms/create        → room_id
POST /interview/rooms/:id/record/start
[concurrent]
  POST /audio/upload-init (context_type: 'interview')
  → upload to Cloudinary
  → POST /audio/complete  → audio_id
POST /interview/rooms/:id/record/stop  { audio_id }  → job_id
Poll GET /jobs/:job_id
GET  /interview/rooms/:id/result
```

### Interview (Gemini Live)

```
GET /interview/config                 → gemini_api_key, live_model
GET /interview/questions?role=...     → 12 questions
POST /interview/rooms/create          → room_id
[Client ↔ Gemini Live — no backend]
POST /interview/rooms/:id/save-report { transcript, report }
GET  /interview/rooms/:id/result
```
