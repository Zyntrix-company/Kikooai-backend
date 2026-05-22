import pool from '../db/pool.js';
import { generateCertificate } from './certificateService.js';
import { uploadBufferAsRaw } from './cloudinaryService.js';
import { pickGameSeed, recordSeedExposure } from './seedSelectionService.js';

// ─── Error helpers ────────────────────────────────────────────────────────────

function notFound(msg, code) {
  return Object.assign(new Error(msg), { status: 404, code });
}

function conflict(msg, code) {
  return Object.assign(new Error(msg), { status: 409, code });
}

function badRequest(msg, code) {
  return Object.assign(new Error(msg), { status: 400, code });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recalculate and persist ranks for all participants in a contest using RANK().
 * Ties share the same rank; the next rank is skipped.
 */
async function recalcRanks(contestId, client = pool) {
  await client.query(
    `UPDATE contest_participants AS cp
     SET rank = sub.new_rank
     FROM (
       SELECT id, RANK() OVER (ORDER BY score DESC) AS new_rank
       FROM contest_participants
       WHERE contest_id = $1
     ) AS sub
     WHERE cp.id = sub.id`,
    [contestId]
  );
}

/**
 * Return the top-N leaderboard rows for a contest plus the calling user's own rank.
 */
async function fetchLeaderboard(contestId, userId, limit = 10, client = pool) {
  const { rows } = await client.query(
    `SELECT cp.rank,
            cp.score,
            cp.user_id,
            cp.joined_at,
            u.username,
            u.fullname
     FROM contest_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.contest_id = $1
     ORDER BY cp.rank ASC NULLS LAST, cp.joined_at ASC
     LIMIT $2`,
    [contestId, limit]
  );

  const { rows: myRows } = await client.query(
    `SELECT rank FROM contest_participants
     WHERE contest_id = $1 AND user_id = $2`,
    [contestId, userId]
  );

  return {
    leaderboard: rows,
    my_rank: myRows[0]?.rank ?? null,
  };
}

/**
 * Log an admin action to the audit table.
 */
async function logAdminAction(adminId, action, targetType, targetId, metadata = {}, client = pool) {
  await client.query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

/**
 * Resolve the game seed to assign to a contest participant.
 * Falls back to null if the games table does not yet exist.
 *
 * @param {string} gameType
 * @param {boolean} randomize  If false, all participants get the same seed.
 * @param {string|null} pinnedSeedId  Already-chosen seed for this contest (non-randomized mode).
 * @returns {{ seedId: string|null, seedPayload: object|null }}
 */
async function resolveGameSeed(gameType, randomize, pinnedSeedId, userId = null) {
  try {
    if (!randomize && pinnedSeedId) {
      const { rows } = await pool.query(
        'SELECT id, seed_json FROM games WHERE id = $1 AND is_active = true LIMIT 1',
        [pinnedSeedId]
      );
      if (!rows[0]) return { seedId: null, seedPayload: null };
      return { seedId: rows[0].id, seedPayload: rows[0].seed_json };
    }

    const game = await pickGameSeed(userId, gameType);
    if (!game) return { seedId: null, seedPayload: null };

    if (userId) await recordSeedExposure(userId, 'game', game.id);
    return { seedId: game.id, seedPayload: game.seed_json };
  } catch {
    return { seedId: null, seedPayload: null };
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Create a new contest (admin only).
 */
export async function createContest(adminId, { title, game_type, start_ts, end_ts, prize_info, settings }) {
  const appBase    = process.env.APP_BASE_URL || '';
  const startTime  = start_ts ? new Date(start_ts) : null;
  const initialStatus = startTime && startTime <= new Date() ? 'active' : 'draft';

  const { rows } = await pool.query(
    `INSERT INTO contests
       (creator_id, game_type, title, start_ts, end_ts, prize_info, settings, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      adminId,
      game_type,
      title,
      start_ts || null,
      end_ts   || null,
      JSON.stringify(prize_info  || {}),
      JSON.stringify(settings    || {}),
      initialStatus,
    ]
  );

  const contest   = rows[0];
  const shareLink = `${appBase}/contests/${contest.token}`;

  const { rows: updated } = await pool.query(
    'UPDATE contests SET share_link = $1 WHERE id = $2 RETURNING *',
    [shareLink, contest.id]
  );

  return updated[0];
}

/**
 * Join a contest by token. No energy is deducted.
 */
export async function joinContest(token, userId) {
  const { rows: cRows } = await pool.query(
    'SELECT * FROM contests WHERE token = $1',
    [token]
  );
  if (!cRows[0]) throw notFound('Contest not found', 'CONTEST_NOT_FOUND');

  const contest = cRows[0];
  if (contest.status !== 'active') {
    throw badRequest('Contest is not currently active', 'CONTEST_NOT_ACTIVE');
  }

  // Check duplicate
  const { rows: existing } = await pool.query(
    'SELECT id FROM contest_participants WHERE contest_id = $1 AND user_id = $2',
    [contest.id, userId]
  );
  if (existing[0]) throw conflict('Already joined this contest', 'ALREADY_JOINED');

  // Resolve game seed
  const randomize    = !!contest.settings?.randomize_seed;
  const pinnedSeedId = contest.settings?.pinned_seed_id || null;
  const { seedId, seedPayload } = await resolveGameSeed(
    contest.game_type,
    randomize,
    pinnedSeedId,
    userId
  );

  const { rows: pRows } = await pool.query(
    `INSERT INTO contest_participants (contest_id, user_id, game_seed_id)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [contest.id, userId, seedId]
  );

  const participant = pRows[0];

  return {
    contest_id:        contest.id,
    contest_title:     contest.title,
    share_link:        contest.share_link,
    participant_token: participant.participant_token,
    game_seed:         seedPayload,
  };
}

/**
 * Get the leaderboard for a contest (full ranked list).
 */
export async function getLeaderboard(token, userId) {
  const { rows: cRows } = await pool.query(
    'SELECT id, title, status, end_ts FROM contests WHERE token = $1',
    [token]
  );
  if (!cRows[0]) throw notFound('Contest not found', 'CONTEST_NOT_FOUND');

  const contest = cRows[0];

  // Re-compute live ranks from actual scores (window function, no mutation)
  const { rows } = await pool.query(
    `SELECT RANK() OVER (ORDER BY cp.score DESC) AS rank,
            cp.score,
            cp.user_id,
            cp.joined_at,
            cp.certificate_url,
            u.username,
            u.fullname
     FROM contest_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.contest_id = $1
     ORDER BY rank ASC, cp.joined_at ASC`,
    [contest.id]
  );

  const myRow = rows.find((r) => r.user_id === userId);

  return {
    contest_id:     contest.id,
    contest_title:  contest.title,
    contest_status: contest.status,
    end_ts:         contest.end_ts,
    leaderboard:    rows,
    my_rank:        myRow?.rank ?? null,
    my_score:       myRow?.score ?? null,
  };
}

/**
 * Submit / update a participant's score and return the refreshed leaderboard.
 */
export async function submitScore(token, userId, score, metadata = {}) {
  const { rows: cRows } = await pool.query(
    'SELECT id, status FROM contests WHERE token = $1',
    [token]
  );
  if (!cRows[0]) throw notFound('Contest not found', 'CONTEST_NOT_FOUND');

  const contest = cRows[0];
  if (contest.status !== 'active') {
    throw badRequest('Contest is not currently active', 'CONTEST_NOT_ACTIVE');
  }

  const { rows: pRows } = await pool.query(
    'SELECT id FROM contest_participants WHERE contest_id = $1 AND user_id = $2',
    [contest.id, userId]
  );
  if (!pRows[0]) throw notFound('You have not joined this contest', 'NOT_A_PARTICIPANT');

  // Only update if the new score is higher (prevents score regression)
  await pool.query(
    `UPDATE contest_participants
     SET score = GREATEST(score, $1)
     WHERE contest_id = $2 AND user_id = $3`,
    [score, contest.id, userId]
  );

  await recalcRanks(contest.id);

  const result = await fetchLeaderboard(contest.id, userId, 10);

  return result;
}

/**
 * Complete a contest, finalize ranks, and distribute prizes (admin only).
 */
export async function completeContest(token, adminId) {
  const { rows: cRows } = await pool.query(
    'SELECT * FROM contests WHERE token = $1',
    [token]
  );
  if (!cRows[0]) throw notFound('Contest not found', 'CONTEST_NOT_FOUND');

  const contest = cRows[0];
  if (contest.status === 'completed') {
    throw badRequest('Contest is already completed', 'ALREADY_COMPLETED');
  }

  // Finalize ranks
  await recalcRanks(contest.id);

  // Update status
  await pool.query(
    "UPDATE contests SET status = 'completed', end_ts = COALESCE(end_ts, now()) WHERE id = $1",
    [contest.id]
  );

  // Prize distribution — find rank-1 participants (ties share rank 1)
  const { rows: winners } = await pool.query(
    `SELECT cp.user_id, cp.rank, u.fullname, u.username
     FROM contest_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.contest_id = $1 AND cp.rank = 1`,
    [contest.id]
  );

  const prizeType  = contest.prize_info?.prize_type;
  const proDays    = parseInt(contest.prize_info?.pro_days || '30', 10);
  const awarded    = [];
  const completedAt = new Date().toISOString();

  for (const winner of winners) {
    // Grant Pro subscription
    if (prizeType === 'pro') {
      await pool.query(
        `UPDATE profiles
         SET subscription_status = 'pro',
             pro_expires_at      = now() + ($1 || ' days')::INTERVAL
         WHERE user_id = $2`,
        [proDays, winner.user_id]
      );
    }

    // Generate and upload certificate (best-effort)
    try {
      const winnerName = winner.fullname || winner.username || 'Winner';
      const pdfBuffer  = await generateCertificate(contest.title, winnerName, winner.rank, completedAt);
      const publicId   = `kikoo/certificates/${contest.id}-${winner.user_id}`;
      const { secureUrl } = await uploadBufferAsRaw(pdfBuffer, publicId, 'application/pdf');

      await pool.query(
        'UPDATE contest_participants SET certificate_url = $1 WHERE contest_id = $2 AND user_id = $3',
        [secureUrl, contest.id, winner.user_id]
      );
    } catch (certErr) {
      console.error(`[contest] Certificate failed for user ${winner.user_id}:`, certErr.message);
    }

    awarded.push(winner.user_id);
  }

  await logAdminAction(adminId, 'complete_contest', 'contest', contest.id, {
    prize_type:    prizeType,
    winners_count: awarded.length,
    winner_ids:    awarded,
  });

  const { leaderboard } = await fetchLeaderboard(contest.id, adminId, 10);

  return {
    contest_id:      contest.id,
    status:          'completed',
    prizes_awarded:  awarded.length,
    winner_ids:      awarded,
    final_leaderboard: leaderboard,
  };
}

/**
 * List active contests (paginated, newest first).
 */
export async function listActiveContests(limit = 20, offset = 0) {
  const { rows } = await pool.query(
    `SELECT id, title, game_type, token, share_link, start_ts, end_ts,
            prize_info, settings, status, created_at,
            (SELECT COUNT(*) FROM contest_participants cp WHERE cp.contest_id = contests.id) AS participant_count
     FROM contests
     WHERE status = 'active'
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}
