import pool from '../db/pool.js';
import * as geminiService from './geminiService.js';
import { jobQueue } from '../jobs/JobQueue.js';
import { interviewJobHandler } from '../jobs/interviewJob.js';

function notFound(msg, code) {
  return Object.assign(new Error(msg), { status: 404, code });
}

function badRequest(msg, code) {
  return Object.assign(new Error(msg), { status: 400, code });
}

// ─── Interview Config ─────────────────────────────────────────────────────────

/**
 * Return Gemini credentials + voice map so the client can connect to Gemini Live.
 * Gated behind JWT auth — key never hits the frontend env.
 */
export function getConfig() {
  return {
    gemini_api_key: process.env.GEMINI_API_KEY,
    live_model:     'gemini-2.5-flash-native-audio-preview-09-2025',
    analysis_model: 'gemini-2.5-flash-preview-05-20',
    voices: {
      emma: 'Kore',
      john: 'Puck',
    },
  };
}

// ─── Interview Question Cache ─────────────────────────────────────────────────

const questionCache = new Map();
const CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour

/**
 * Generate (or return cached) interview questions for a role/round/difficulty combo.
 * @param {string} role
 * @param {string} round
 * @param {string} difficulty
 */
export async function getInterviewQuestions(role, round, difficulty) {
  const cacheKey = `${role}:${round}:${difficulty}`.toLowerCase();
  const cached   = questionCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await geminiService.generateInterviewQuestions(role, round, difficulty);
  questionCache.set(cacheKey, { data, cachedAt: Date.now() });
  return data;
}

// ─── Save Live Interview Report ───────────────────────────────────────────────

/**
 * Persist the client-generated transcript + analysis report to the interview_rooms row.
 * @param {string} roomId
 * @param {string} userId
 * @param {Array}  transcript  Array of { role, text } objects
 * @param {object} report      { score, feedback, strengths, improvements, ... }
 */
export async function saveReport(roomId, userId, transcript, report) {
  const { rows } = await pool.query(
    'SELECT id, status FROM interview_rooms WHERE id = $1 AND host_id = $2',
    [roomId, userId]
  );
  if (!rows[0]) throw notFound('Room not found', 'ROOM_NOT_FOUND');

  await pool.query(
    `UPDATE interview_rooms
     SET status = 'done', end_ts = COALESCE(end_ts, now()), result_json = $1
     WHERE id = $2`,
    [JSON.stringify({ transcript, report }), roomId]
  );

  return { room_id: roomId, status: 'done' };
}

export async function createRoom(userId, settings) {
  const { rows } = await pool.query(
    `INSERT INTO interview_rooms (host_id, settings, status)
     VALUES ($1, $2, 'created')
     RETURNING id, room_token, settings, status, created_at`,
    [userId, JSON.stringify(settings)]
  );
  const row = rows[0];
  return {
    room_id:    row.id,
    room_token: row.room_token,
    settings:   row.settings,
    status:     row.status,
  };
}

export async function startRecording(roomId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM interview_rooms WHERE id = $1 AND host_id = $2',
    [roomId, userId]
  );
  if (!rows[0]) throw notFound('Room not found', 'ROOM_NOT_FOUND');

  const room = rows[0];
  if (room.status !== 'created') {
    throw badRequest('Room is already active or completed', 'ROOM_ALREADY_ACTIVE');
  }

  const { rows: updated } = await pool.query(
    `UPDATE interview_rooms
     SET status = 'recording', start_ts = now()
     WHERE id = $1
     RETURNING id, status, start_ts`,
    [roomId]
  );
  const r = updated[0];
  return { room_id: r.id, status: r.status, start_ts: r.start_ts };
}

export async function stopRecording(roomId, userId, audioId) {
  const { rows } = await pool.query(
    'SELECT * FROM interview_rooms WHERE id = $1 AND host_id = $2',
    [roomId, userId]
  );
  if (!rows[0]) throw notFound('Room not found', 'ROOM_NOT_FOUND');

  const room = rows[0];
  if (room.status !== 'recording') {
    throw badRequest('Room is not currently recording', 'ROOM_NOT_RECORDING');
  }

  // Verify audio ownership
  const { rows: audioRows } = await pool.query(
    'SELECT id FROM audio_files WHERE id = $1 AND user_id = $2',
    [audioId, userId]
  );
  if (!audioRows[0]) throw notFound('Audio file not found', 'AUDIO_NOT_FOUND');

  await pool.query(
    `UPDATE interview_rooms
     SET status = 'processing', end_ts = now(), audio_id = $1
     WHERE id = $2`,
    [audioId, roomId]
  );

  const questions = room.settings?.questions || [];
  const jobRole   = room.settings?.job_role || 'General';

  // Create the job row first
  const { rows: jobRows } = await pool.query(
    `INSERT INTO jobs (type, status, user_id, payload_ref)
     VALUES ('interview_score', 'pending', $1, '{}')
     RETURNING id`,
    [userId]
  );
  const jobId = jobRows[0].id;

  await jobQueue.enqueue(
    'interview_score',
    { roomId, audioId, userId, questions, jobRole },
    interviewJobHandler,
    { userId, jobId }
  );

  return {
    room_id: roomId,
    job_id:  jobId,
    status:  'processing',
    message: 'Interview processing started. Poll /jobs/:job_id/status.',
  };
}

export async function getRoomResult(roomId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM interview_rooms WHERE id = $1 AND host_id = $2',
    [roomId, userId]
  );
  if (!rows[0]) throw notFound('Room not found', 'ROOM_NOT_FOUND');

  const room = rows[0];
  if (room.status !== 'done') {
    return { room_id: roomId, status: room.status, result: null };
  }
  return { room_id: roomId, status: room.status, result: room.result_json };
}

export async function evaluateScrapedAnswer(userId, { questionText, answerText, audioId, jobRole }) {
  if (!answerText && !audioId) {
    throw badRequest('Provide at least one of answer_text or audio_id', 'ANSWER_REQUIRED');
  }

  let finalAnswer = answerText || '';

  if (audioId) {
    const { rows: tRows } = await pool.query(
      'SELECT raw_text FROM transcripts WHERE audio_id = $1 AND user_id = $2 LIMIT 1',
      [audioId, userId]
    );
    if (!tRows[0]) {
      return { status: 202, message: 'Audio transcript not ready' };
    }
    finalAnswer = answerText
      ? answerText + '\n' + tRows[0].raw_text
      : tRows[0].raw_text;
  }

  const feedback = await geminiService.generateInterviewFeedback(
    finalAnswer,
    questionText,
    jobRole || 'General'
  );

  await pool.query(
    `INSERT INTO jobs (type, status, user_id, payload_ref)
     VALUES ('interview_score', 'done', $1, $2)`,
    [userId, JSON.stringify({ question_text: questionText })]
  );

  return { feedback, overall_score: feedback.overall_score };
}
