# KikooAI — Frontend Implementation Guide

Complete reference for integrating the KikooAI backend into any frontend (React, Next.js, Vue, React Native, etc.).

---

## Table of Contents

1. [Setup & Auth](#1-setup--auth)
2. [Token Management](#2-token-management)
3. [User Profile](#3-user-profile)
4. [Text Exercises](#4-text-exercises)
5. [Audio Recording & Speaking Feedback](#5-audio-recording--speaking-feedback)
6. [Resume Upload (File)](#6-resume-upload-file)
7. [Resume as JSON](#7-resume-as-json)
8. [Resume Analysis & Roast](#8-resume-analysis--roast)
9. [Interview Rooms](#9-interview-rooms)
10. [Scraped Question Evaluator](#10-scraped-question-evaluator)
11. [Job Status Polling](#11-job-status-polling)
12. [Error Handling Reference](#12-error-handling-reference)
13. [Response Envelope](#13-response-envelope)
14. [Environment Config](#14-environment-config)

---

## 1. Setup & Auth

**Base URL:** `http://localhost:3000` (dev) — set via environment variable in production.

### Signup

```
POST /api/v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",      // min 8 chars
  "username": "myusername",       // alphanumeric, 3–30 chars, unique
  "fullname": "Jane Doe",
  "role": "student"               // student | job_seeker | professional
}
```

**201 Response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "...", "username": "...", "role": "...", "is_admin": false },
    "accessToken": "eyJ...",
    "refreshToken": "uuid-v4"
  }
}
```

### Login

```
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**200 Response:** Same shape as signup.

**Error codes:** `401 INVALID_CREDENTIALS` · `403 ACCOUNT_BANNED`

### Logout

```
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

Invalidates all refresh tokens for the session.

---

## 2. Token Management

Access tokens expire in **15 minutes** (configurable via `JWT_EXPIRY`). Implement a refresh flow:

```
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refreshToken": "uuid-v4" }
```

**200 Response:** New `accessToken` + `refreshToken` pair (old refresh token is invalidated).

### Recommended client-side approach

```js
// Axios interceptor example
axios.interceptors.response.use(null, async (error) => {
  if (error.response?.status === 401 && !error.config._retry) {
    error.config._retry = true;
    const { data } = await axios.post('/api/v1/auth/refresh', {
      refreshToken: localStorage.getItem('refreshToken'),
    });
    localStorage.setItem('accessToken', data.data.accessToken);
    localStorage.setItem('refreshToken', data.data.refreshToken);
    error.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
    return axios(error.config);
  }
  return Promise.reject(error);
});
```

---

## 3. User Profile

### Get current user

```
GET /api/v1/users/me
Authorization: Bearer <accessToken>
```

**200 Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "myusername",
      "role": "job_seeker",
      "profile": {
        "xp": 350,
        "streak": 5,
        "daily_energy_count": 3,
        "badges": ["streak_7"],
        "subscription_status": "free"
      }
    }
  }
}
```

### Update profile

```
PATCH /api/v1/users/me
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "interests": ["backend", "system design"],
  "education": { "degree": "B.Tech", "year": 2022 },
  "motive": "Land a FAANG backend role",
  "targets": { "company": "Google", "role": "SWE II" },
  "resume_ref": "uuid-of-resume"   // link profile to a resume
}
```

All fields optional — send only what changed.

---

## 4. Text Exercises

### Get a random exercise seed

```
GET /api/v1/exercises/:type/seed?difficulty=medium
Authorization: Bearer <accessToken>
```

**Types:** `fillup` · `jumbled_word` · `jumbled_sentence` · `vocab` · `synonyms` · `antonyms` · `pronunciation_spelling` · `grammar_transform` · `typing_from_audio`

**Difficulty:** `easy` · `medium` (default) · `hard`

**200 Response (fillup example):**
```json
{
  "success": true,
  "data": {
    "seed": {
      "id": "uuid",
      "type": "fillup",
      "difficulty": "medium",
      "payload": {
        "sentence": "She ___ to work every day.",
        "options": ["walk", "walks", "walking", "walked"],
        "hint": "Present simple, third person singular"
      }
    }
  }
}
```

> Note: `answer_key` is never returned to the client — it's only used server-side.

### Submit an answer

```
POST /api/v1/exercises/:type/submit
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "seed_id": "uuid",
  "user_answer": "walks"
}
```

For `vocab` / `synonyms` / `antonyms` — send the option letter: `"a"` · `"b"` · `"c"` · `"d"`.

**200 Response:**
```json
{
  "success": true,
  "data": {
    "is_correct": true,
    "score": 150,
    "xp_awarded": 15,
    "explanation": "Present simple for habitual actions uses the base form + s for third person.",
    "hints": ["Think about subject-verb agreement."]
  }
}
```

**402 ENERGY_DEPLETED** — user has hit the daily exercise limit:
```json
{
  "success": false,
  "error": "Daily exercise limit reached",
  "code": "ENERGY_DEPLETED",
  "data": { "resets_at": "2026-03-26T00:00:00.000Z" }
}
```

### Speaking exercise prompt

```
GET /api/v1/exercises/speaking/prompt
Authorization: Bearer <accessToken>
```

Returns a speaking prompt matched to the user's CEFR level (auto-derived from XP).

### Evaluate a speaking recording

```
POST /api/v1/exercises/speaking/evaluate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "audio_id": "uuid",      // from audio complete step
  "prompt_id": "uuid"      // the seed id from GET /speaking/prompt
}
```

Requires `audio_files.status = 'done'` (transcription complete).

**200 Response:**
```json
{
  "success": true,
  "data": {
    "score": 84,
    "xp_awarded": 17,
    "feedback": {
      "pronunciation": { "score": 82 },
      "vocabulary": { "score": 85 },
      "grammar": { "score": 90 },
      "fluency": { "score": 78, "wpm": 125 },
      "overall_score": 84,
      "level": "B2"
    }
  }
}
```

---

## 5. Audio Recording & Speaking Feedback

The upload is a **4-step flow** — the audio never passes through the backend server:

```
Step 1: POST /audio/upload-init       → get Cloudinary signature
Step 2: [Client] POST to Cloudinary   → upload file directly
Step 3: POST /audio/complete          → tell backend upload is done
Step 4: Poll GET /jobs/:id/status     → wait for transcription
Step 5: GET /audio/:id/transcript     → fetch result
```

### Step 1 — Get upload signature

```
POST /api/v1/audio/upload-init
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "filename": "recording.webm",
  "format": "webm",
  "context_type": "speaking",
  "duration_seconds": 45
}
```

**200 Response:**
```json
{
  "success": true,
  "data": {
    "upload_id": "uuid",
    "cloudinary": {
      "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/video/upload",
      "signature": "abc123...",
      "timestamp": 1774461359,
      "apiKey": "986456461221934",
      "cloudName": "your-cloud",
      "folder": "kikoo/audio/<user-id>"
    },
    "expires_in_seconds": 900
  }
}
```

### Step 2 — Upload to Cloudinary directly

```js
const formData = new FormData();
formData.append('file', audioBlob);
formData.append('signature', cloudinary.signature);
formData.append('timestamp', cloudinary.timestamp);
formData.append('api_key', cloudinary.apiKey);
formData.append('folder', cloudinary.folder);
formData.append('resource_type', 'video');

const { data } = await fetch(cloudinary.uploadUrl, {
  method: 'POST',
  body: formData,
});
// Save: data.public_id, data.secure_url
```

### Step 3 — Confirm upload

```
POST /api/v1/audio/complete
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "upload_id": "uuid",
  "cloudinary_public_id": "kikoo/audio/<user-id>/recording",
  "cloudinary_url": "https://res.cloudinary.com/...",
  "format": "webm",
  "duration_seconds": 45,
  "prompt_text": "Describe your morning routine."  // optional
}
```

**202 Response:**
```json
{
  "success": true,
  "data": {
    "audio_id": "uuid",
    "job_id": "uuid",
    "message": "Transcription started. Poll /jobs/:job_id/status for progress."
  }
}
```

### Steps 4 & 5 — Poll + fetch result

See [Job Status Polling](#11-job-status-polling). Once `status = done`, call:

```
GET /api/v1/audio/:audio_id/transcript
Authorization: Bearer <accessToken>
```

---

## 6. Resume Upload (File)

For PDF, DOCX, or TXT resumes. Uses a **3-step Cloudinary flow** (same pattern as audio):

```
Step 1: POST /resumes/upload-init       → get Cloudinary signature
Step 2: [Client] POST to Cloudinary     → upload file directly (resource_type: raw)
Step 3: POST /resumes/upload-complete   → confirm + verify on Cloudinary
```

### Step 1 — Get upload signature

```
POST /api/v1/resumes/upload-init
Authorization: Bearer <accessToken>
```

No body required.

**200 Response:**
```json
{
  "success": true,
  "data": {
    "resume_id": "uuid",
    "cloudinary": {
      "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/raw/upload",
      "signature": "abc123...",
      "timestamp": 1774461359,
      "apiKey": "...",
      "cloudName": "...",
      "folder": "kikoo/resumes/<user-id>"
    }
  }
}
```

### Step 2 — Upload to Cloudinary

```js
const formData = new FormData();
formData.append('file', pdfFile);              // File object from <input type="file">
formData.append('signature', cloudinary.signature);
formData.append('timestamp', String(cloudinary.timestamp));
formData.append('api_key', cloudinary.apiKey);
formData.append('folder', cloudinary.folder);
// No resource_type needed in form for raw — the URL already targets /raw/upload

const res = await fetch(cloudinary.uploadUrl, {
  method: 'POST',
  body: formData,
});
const { public_id, secure_url, format } = await res.json();
```

### Step 3 — Confirm upload

```
POST /api/v1/resumes/upload-complete
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "resume_id": "uuid",
  "cloudinary_public_id": "kikoo/resumes/<user-id>/my-resume",
  "cloudinary_url": "https://res.cloudinary.com/...",
  "format": "pdf",                     // pdf | docx | txt
  "title": "My Software Engineer Resume"  // optional, max 100 chars
}
```

**200 Response:**
```json
{
  "success": true,
  "data": {
    "resume": {
      "id": "uuid",
      "title": "My Software Engineer Resume",
      "file_format": "pdf",
      "cloudinary_url": "https://...",
      "created_at": "2026-03-29T..."
    }
  }
}
```

---

## 7. Resume as JSON

For when the user has structured resume data from a form builder (no file upload needed):

```
POST /api/v1/resumes/save-json
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "title": "My Software Engineer Resume",
  "json_blob": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "experience": [
      { "role": "Backend Developer", "company": "Acme", "years": 3 }
    ],
    "skills": ["Node.js", "PostgreSQL", "Docker"],
    "education": [{ "degree": "B.Tech Computer Science", "year": 2022 }]
  }
}
```

`json_blob` accepts any object shape — the schema is flexible.

**201 Response:**
```json
{
  "success": true,
  "data": {
    "resume": { "id": "uuid", "title": "...", "json_blob": {...}, "created_at": "..." }
  }
}
```

### List resumes

```
GET /api/v1/resumes
Authorization: Bearer <accessToken>
```

Returns up to 20 most recent resumes (newest first).

### Delete a resume

```
DELETE /api/v1/resumes/:resume_id
Authorization: Bearer <accessToken>
```

Deletes from Cloudinary (if file) and cascades to all associated reports.

---

## 8. Resume Analysis & Roast

Once a resume exists (from upload or JSON), trigger an AI analysis:

### Analyze

```
POST /api/v1/resumes/analyze
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "resume_id": "uuid",
  "jd_text": "We are looking for a backend developer with 2+ years...",  // min 50 chars
  "cover_letter": "Dear Hiring Manager..."                                 // optional
}
```

### Roast

```
POST /api/v1/resumes/roast
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "resume_id": "uuid",
  "jd_text": "We are looking for a backend developer..."
}
```

**Both return 202:**
```json
{
  "success": true,
  "data": {
    "report_id": "uuid",
    "job_id": "uuid",
    "message": "Analysis started. Poll /resumes/reports/:report_id for results."
  }
}
```

### Poll the report

```
GET /api/v1/resumes/reports/:report_id
Authorization: Bearer <accessToken>
```

**202** — still processing:
```json
{ "success": true, "data": { "status": "processing", "report": null, "message": "Analysis in progress" } }
```

**200** — done:
```json
{
  "success": true,
  "data": {
    "status": "done",
    "score": 78,
    "analysis_type": "analyze",
    "created_at": "2026-03-29T...",
    "report": {
      "strengths": ["Strong Node.js experience", "Relevant PostgreSQL skills"],
      "ats_issues": [
        { "issue": "Missing action verbs in bullet points", "severity": "high", "fix": "Start each bullet with a strong verb like 'Built', 'Designed', 'Optimized'" }
      ],
      "suggested_bullets": [
        { "section": "Experience", "original": "Worked on backend APIs", "improved": "Built and deployed 12 RESTful APIs serving 50k+ daily requests" }
      ],
      "improvement_steps": [
        { "step": "Add quantifiable metrics to all experience bullet points", "priority": 1 }
      ],
      "keywords_missing": ["Docker", "CI/CD", "Microservices"],
      "keywords_matched": ["Node.js", "PostgreSQL", "REST API"],
      "score": 78,
      "score_breakdown": { "relevance": 85, "formatting": 70, "impact": 75, "ats_compatibility": 80 },
      "summary": "Strong technical foundation but needs more impact-driven bullet points.",
      "roast_lines": []
    }
  }
}
```

For `roast` type, `roast_lines` will contain 3–5 witty comments:
```json
"roast_lines": [
  "Your experience section reads like a job description, not a resume — tell me what YOU did, not what the role required.",
  "Three years of experience, zero numbers. Were your achievements classified?"
]
```

### Polling strategy

```js
async function pollReport(reportId, token, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(`/api/v1/resumes/reports/${reportId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    if (res.status === 200 && json.data.status === 'done') {
      return json.data;
    }
    if (json.data?.status === 'failed') throw new Error('Analysis failed');
    await new Promise(r => setTimeout(r, 3000)); // poll every 3s
  }
  throw new Error('Timed out waiting for analysis');
}
```

---

## 9. Interview Rooms

Full mock interview flow with AI scoring.

### Step 1 — Create a room

```
POST /api/v1/interview/rooms/create
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "duration_mins": 30,
  "job_role": "Backend Developer",
  "company": "Google",
  "difficulty": "medium",
  "question_count": 5,
  "questions": [
    { "question_text": "Tell me about yourself and your backend experience." },
    { "question_text": "How do you handle database performance issues?" },
    { "question_text": "Describe a challenging bug you resolved." }
  ]
}
```

All fields optional. If no `questions` provided, the user can answer an open-ended question.

**201 Response:**
```json
{
  "success": true,
  "data": {
    "room_id": "uuid",
    "room_token": "48-char hex token",
    "settings": { "job_role": "Backend Developer", "questions": [...], ... },
    "status": "created"
  }
}
```

Save `room_id` — you'll need it for all subsequent room calls.

### Step 2 — Start recording

```
POST /api/v1/interview/rooms/:room_id/record/start
Authorization: Bearer <accessToken>
```

No body.

**200 Response:**
```json
{ "success": true, "data": { "room_id": "uuid", "status": "recording", "start_ts": "2026-03-29T..." } }
```

**400 ROOM_ALREADY_ACTIVE** — room was already started.

### Step 3 — Record audio

Use the standard audio pipeline to record and upload the interview audio:

```
POST /api/v1/audio/upload-init   (context_type: "interview")
  → Upload to Cloudinary
POST /api/v1/audio/complete
  → Get audio_id (no need to wait for transcription — interview job handles it)
```

> Tip: You can call `audio/upload-init` and `record/start` concurrently.

### Step 4 — Stop recording + trigger processing

```
POST /api/v1/interview/rooms/:room_id/record/stop
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "audio_id": "uuid" }
```

**202 Response:**
```json
{
  "success": true,
  "data": {
    "room_id": "uuid",
    "job_id": "uuid",
    "status": "processing",
    "message": "Interview processing started. Poll /jobs/:job_id/status."
  }
}
```

### Step 5 — Poll job status

```
GET /api/v1/jobs/:job_id/status
Authorization: Bearer <accessToken>
```

Progress milestones: `10%` → `20%` → `35%` → `55%` → `85%` → `100%`

### Step 6 — Get result

```
GET /api/v1/interview/rooms/:room_id/result
Authorization: Bearer <accessToken>
```

**200 Response (when done):**
```json
{
  "success": true,
  "data": {
    "room_id": "uuid",
    "status": "done",
    "result": {
      "transcript": "Hi, I'm a backend developer with 3 years...",
      "overall_score": 74,
      "summary": "Interview completed. 3 question(s) evaluated. Overall score: 74/100.",
      "question_results": [
        {
          "question": "Tell me about yourself and your backend experience.",
          "feedback": {
            "relevance_score": 80,
            "communication_score": 75,
            "structure_score": 70,
            "confidence_indicators": ["clear opening", "good pacing"],
            "star_method_used": false,
            "strengths": ["Good technical depth", "Relevant experience mentioned"],
            "improvements": ["Add a concise summary sentence", "Use the STAR method for examples"],
            "model_answer_outline": "Start with current role → 2-3 key achievements → why this company → future goals",
            "overall_score": 74,
            "one_line_verdict": "Solid but could be more structured and concise."
          }
        }
      ]
    }
  }
}
```

### List all rooms

```
GET /api/v1/interview/rooms
Authorization: Bearer <accessToken>
```

Returns up to 20 most recent rooms (newest first).

---

## 10. Scraped Question Evaluator

No room needed. Evaluate any question + answer immediately (great for browser extensions):

```
POST /api/v1/interview/questions/evaluate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "question_text": "Explain the difference between SQL and NoSQL.",  // min 10 chars, required
  "answer_text": "SQL uses structured schemas with ACID...",          // at least one of these
  "audio_id": "uuid",                                                 // or this (or both)
  "job_role": "Backend Developer"                                     // optional
}
```

At least one of `answer_text` or `audio_id` is required.

If `audio_id` is provided, the transcript must already be ready (i.e., transcription job done). If not ready, you'll get a `202` — retry later.

**200 Response:**
```json
{
  "success": true,
  "data": {
    "overall_score": 82,
    "feedback": {
      "relevance_score": 85,
      "communication_score": 80,
      "structure_score": 78,
      "confidence_indicators": ["uses technical terminology correctly"],
      "star_method_used": false,
      "strengths": ["Accurate technical comparison", "Clear language"],
      "improvements": ["Add a real-world use case example", "Mention CAP theorem"],
      "model_answer_outline": "Define SQL → Define NoSQL → Key differences (schema, scaling, consistency) → Use-case examples",
      "overall_score": 82,
      "one_line_verdict": "Good technical answer, could be stronger with real-world context."
    }
  }
}
```

---

## 11. Job Status Polling

All background AI tasks (transcription, resume analysis, interview scoring) use the same polling endpoint:

```
GET /api/v1/jobs/:job_id/status
Authorization: Bearer <accessToken>
```

**200 Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "processing",
    "progress_pct": 55,
    "error_message": null,
    "updated_at": "2026-03-29T18:30:00.000Z"
  }
}
```

| `status` | Meaning |
|---|---|
| `pending` | Queued, not started yet |
| `processing` | In progress — show `progress_pct` in a progress bar |
| `done` | Complete — fetch the result |
| `failed` | Error — check `error_message` |

### List all jobs

```
GET /api/v1/jobs
Authorization: Bearer <accessToken>
```

Returns the 20 most recent jobs for the authenticated user.

### Generic polling helper

```js
async function pollJob(jobId, token, { interval = 2000, timeout = 120000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const res = await fetch(`/api/v1/jobs/${jobId}/status`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { data } = await res.json();
    if (data.status === 'done')    return data;
    if (data.status === 'failed')  throw new Error(data.error_message || 'Job failed');
    // Optional: update a progress bar with data.progress_pct
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Job timed out');
}
```

---

## 12. Error Handling Reference

All error responses follow this shape:
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
| `DUPLICATE_USER` | 409 | Email or username already in use |
| `NOT_FOUND` | 404 | Route doesn't exist |
| `ENERGY_DEPLETED` | 402 | Daily exercise limit hit |
| `AUDIO_NOT_FOUND` | 404 | Audio file missing or wrong owner |
| `JOB_NOT_FOUND` | 404 | Job missing or wrong owner |
| `RESUME_NOT_FOUND` | 404 | Resume missing or wrong owner |
| `REPORT_NOT_FOUND` | 404 | Resume report missing or wrong owner |
| `ROOM_NOT_FOUND` | 404 | Interview room missing or wrong owner |
| `ROOM_ALREADY_ACTIVE` | 400 | Room already recording or completed |
| `ROOM_NOT_RECORDING` | 400 | Tried to stop a room that isn't recording |
| `ANSWER_REQUIRED` | 400 | Neither `answer_text` nor `audio_id` provided |
| `FILE_NOT_FOUND_ON_CLOUDINARY` | 400 | Uploaded file not verifiable on Cloudinary |
| `CLOUDINARY_ERROR` | 400 | Generic Cloudinary API failure |
| `JD_TOO_SHORT` | 400 | `jd_text` must be at least 50 characters |
| `AI_SERVICE_ERROR` | 502 | Gemini API failure |
| `AI_PARSE_ERROR` | 502 | Gemini returned malformed JSON |

---

## 13. Response Envelope

Every response uses this consistent envelope:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

`202 Accepted` responses (for async jobs) also use `{ "success": true, "data": { ... } }`.

---

## 14. Environment Config

Set these on your frontend (e.g., `.env.local` in Next.js):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

---

## Complete Flow Diagrams

### Resume Analysis

```
User submits resume form
        │
        ▼
POST /resumes/save-json  (or file upload flow)
        │
        ▼ resume_id
POST /resumes/analyze (or /resumes/roast)
        │
        ▼ { report_id, job_id }
Poll GET /jobs/:job_id/status every 3s
        │
        ▼ status = done
GET /resumes/reports/:report_id
        │
        ▼
Display score + feedback
```

### Resume File Upload

```
User selects PDF/DOCX file
        │
        ▼
POST /resumes/upload-init
        │
        ▼ { resume_id, cloudinary: { uploadUrl, signature, ... } }
POST to cloudinary.uploadUrl (multipart, directly from browser)
        │
        ▼ { public_id, secure_url, format }
POST /resumes/upload-complete
        │
        ▼ confirmed resume_id
Use resume_id in /analyze or /roast
```

### Interview Session

```
User configures interview settings + questions
        │
        ▼
POST /interview/rooms/create
        │
        ▼ { room_id, room_token }
User clicks "Start"
        │
        ├── POST /interview/rooms/:id/record/start
        └── POST /audio/upload-init (context_type: "interview")
                │
                ▼
        [User speaks answer(s)]
                │
                ▼
        POST to Cloudinary uploadUrl
                │
                ▼ public_id
        POST /audio/complete   →  audio_id
                │
                ▼
POST /interview/rooms/:id/record/stop  { audio_id }
        │
        ▼ { job_id }
Poll GET /jobs/:job_id/status every 3s
        │
        ▼ status = done
GET /interview/rooms/:id/result
        │
        ▼
Display per-question scores + transcript
```

### Scraped Question (Browser Extension / Quick Evaluate)

```
User is on a job site, sees an interview question
        │
        ▼
User types/speaks their answer
        │
        ▼
POST /interview/questions/evaluate  { question_text, answer_text }
        │
        ▼ immediate response
Display feedback JSON
```
