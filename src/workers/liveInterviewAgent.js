import pool from '../db/pool.js';
import * as livekitService from '../services/livekitService.js';

const AI_IDENTITY = 'ai-interviewer';

/**
 * Dispatch boundary for the realtime interview agent.
 *
 * In production this function is the hand-off point to the deployed LiveKit/Gemini
 * worker process. Keeping it separate from Express prevents long-running media
 * sessions from being tied to an HTTP request lifecycle.
 */
export async function dispatchLiveInterviewAgent({ roomId, roomName, settings }) {
  const metadata = {
    room_id: roomId,
    role: 'ai-interviewer',
    settings,
  };

  let agentToken = null;
  try {
    const tokenResult = await livekitService.createParticipantToken({
      roomName,
      identity: AI_IDENTITY,
      name: 'AI Interviewer',
      metadata,
    });
    agentToken = tokenResult.token;
  } catch (err) {
    await markAgentFailed(roomId, err);
    throw err;
  }

  await pool.query(
    `UPDATE interview_rooms
     SET agent_status = $1
     WHERE id = $2`,
    ['pending', roomId]
  );

  if (process.env.LIVE_INTERVIEW_AGENT_WEBHOOK_URL) {
    await notifyAgentRuntime({ roomId, roomName, settings, agentToken });
  } else {
    console.log(
      `[LiveInterviewAgent] Agent dispatch queued for room ${roomId}. ` +
      'Set LIVE_INTERVIEW_AGENT_WEBHOOK_URL to hand off to an external media worker.'
    );
  }

  return { identity: AI_IDENTITY, status: 'pending' };
}

async function notifyAgentRuntime({ roomId, roomName, settings, agentToken }) {
  const res = await fetch(process.env.LIVE_INTERVIEW_AGENT_WEBHOOK_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.LIVE_INTERVIEW_AGENT_SECRET
        ? { Authorization: `Bearer ${process.env.LIVE_INTERVIEW_AGENT_SECRET}` }
        : {}),
    },
    body: JSON.stringify({
      room_id: roomId,
      room_name: roomName,
      livekit_url: livekitService.getLiveKitUrl(),
      agent_identity: AI_IDENTITY,
      agent_token: agentToken,
      gemini: {
        live_model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025',
      },
      settings,
    }),
  });

  if (!res.ok) {
    const err = new Error(`Live interview agent dispatch failed with HTTP ${res.status}`);
    err.code = 'AGENT_DISPATCH_FAILED';
    err.status = 502;
    await markAgentFailed(roomId, err);
    throw err;
  }
}

async function markAgentFailed(roomId, err) {
  await pool.query(
    `UPDATE interview_rooms
     SET status = 'failed', agent_status = 'failed', result_json = $1
     WHERE id = $2`,
    [JSON.stringify({ error: err.message, code: err.code || 'AGENT_ERROR' }), roomId]
  ).catch(() => {});
}

export async function markAgentJoined(roomId) {
  await pool.query(
    `UPDATE interview_rooms
     SET agent_status = 'joined'
     WHERE id = $1`,
    [roomId]
  );
}

export async function completeLiveInterview(roomId, transcript = [], report = null) {
  await pool.query(
    `UPDATE interview_rooms
     SET status = 'done',
         agent_status = 'completed',
         live_ended_at = COALESCE(live_ended_at, now()),
         end_ts = COALESCE(end_ts, now()),
         transcript_json = $1,
         result_json = $2
     WHERE id = $3`,
    [
      JSON.stringify(transcript),
      JSON.stringify({ transcript, report }),
      roomId,
    ]
  );
}
