import pool from '../db/pool.js';
import { sanitizeUser } from '../utils/sanitize.js';
import { uploadBufferAsRaw } from './cloudinaryService.js';
import { jobQueue } from '../jobs/JobQueue.js';
import { resumeJobHandler } from '../jobs/resumeJob.js';
import { transcriptionJobHandler } from '../jobs/transcriptionJob.js';
import { interviewJobHandler } from '../jobs/interviewJob.js';

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

// ─── Audit log ────────────────────────────────────────────────────────────────

/**
 * Append a row to admin_actions.
 * Safe to call with any client (defaults to the shared pool).
 */
export async function logAdminAction(adminId, action, targetType, targetId, metadata = {}, client = pool) {
  await client.query(
    `INSERT INTO admin_actions (admin_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, targetType || null, targetId || null, JSON.stringify(metadata)]
  );
}

// ─── User management ──────────────────────────────────────────────────────────

/**
 * List users with optional search on email or username.
 */
export async function listUsers({ search, limit = 20, offset = 0 }) {
  const safeLimit  = Math.min(parseInt(limit,  10) || 20, 100);
  const safeOffset = parseInt(offset, 10) || 0;

  let query, params;
  if (search) {
    const term = `%${search}%`;
    query = `
      SELECT u.id, u.email, u.username, u.fullname, u.role,
             u.is_banned, u.is_flagged, u.is_admin, u.created_at, u.last_active,
             p.subscription_status, p.streak, p.xp
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.email ILIKE $1 OR u.username ILIKE $1
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3`;
    params = [term, safeLimit, safeOffset];
  } else {
    query = `
      SELECT u.id, u.email, u.username, u.fullname, u.role,
             u.is_banned, u.is_flagged, u.is_admin, u.created_at, u.last_active,
             p.subscription_status, p.streak, p.xp
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2`;
    params = [safeLimit, safeOffset];
  }

  const { rows } = await pool.query(query, params);

  // Count for pagination
  const countQuery = search
    ? `SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR username ILIKE $1`
    : `SELECT COUNT(*) FROM users`;
  const countParams = search ? [`%${search}%`] : [];
  const { rows: [{ count }] } = await pool.query(countQuery, countParams);

  return { users: rows, total: parseInt(count, 10), limit: safeLimit, offset: safeOffset };
}

/**
 * Full user detail: profile + activity counts.
 */
export async function getUserDetail(userId) {
  const { rows: [row] } = await pool.query(
    `SELECT u.id, u.email, u.username, u.fullname, u.role,
            u.is_banned, u.is_flagged, u.is_admin, u.flags,
            u.created_at, u.last_active,
            p.interests, p.education, p.motive, p.targets, p.resume_ref,
            p.subscription_status, p.pro_expires_at, p.streak, p.xp,
            p.daily_energy_count, p.badges, p.last_streak_update
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!row) throw notFound('User not found', 'USER_NOT_FOUND');

  const { rows: [{ count: submissionCount }] } = await pool.query(
    'SELECT COUNT(*) FROM exercise_submissions WHERE user_id = $1',
    [userId]
  );

  const { rows: [{ count: audioCount }] } = await pool.query(
    'SELECT COUNT(*) FROM audio_files WHERE user_id = $1',
    [userId]
  );

  const { rows: [{ count: resumeCount }] } = await pool.query(
    'SELECT COUNT(*) FROM resumes WHERE user_id = $1',
    [userId]
  );

  return {
    ...sanitizeUser(row),
    stats: {
      exercise_submissions: parseInt(submissionCount, 10),
      audio_files:          parseInt(audioCount, 10),
      resumes:              parseInt(resumeCount, 10),
    },
  };
}

/**
 * Ban a user. Logs action with reason.
 */
export async function banUser(adminId, userId, reason) {
  const { rows: [user] } = await pool.query(
    'SELECT id, is_banned FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');
  if (user.is_banned) throw badRequest('User is already banned', 'ALREADY_BANNED');

  await pool.query('UPDATE users SET is_banned = true WHERE id = $1', [userId]);
  await logAdminAction(adminId, 'ban_user', 'user', userId, { reason: reason || null });

  return { user_id: userId, is_banned: true };
}

/**
 * Unban a user.
 */
export async function unbanUser(adminId, userId) {
  const { rows: [user] } = await pool.query(
    'SELECT id, is_banned FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');
  if (!user.is_banned) throw badRequest('User is not banned', 'NOT_BANNED');

  await pool.query('UPDATE users SET is_banned = false WHERE id = $1', [userId]);
  await logAdminAction(adminId, 'unban_user', 'user', userId, {});

  return { user_id: userId, is_banned: false };
}

/**
 * Flag a user — appends a structured entry to flags JSONB and sets is_flagged = true.
 */
export async function flagUser(adminId, userId, reason) {
  const { rows: [user] } = await pool.query(
    'SELECT id, flags FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  const existingFlags = Array.isArray(user.flags) ? user.flags : [];
  const newFlag = {
    reason:     reason || null,
    flagged_by: adminId,
    flagged_at: new Date().toISOString(),
  };
  const updatedFlags = [...existingFlags, newFlag];

  await pool.query(
    'UPDATE users SET is_flagged = true, flags = $1 WHERE id = $2',
    [JSON.stringify(updatedFlags), userId]
  );
  await logAdminAction(adminId, 'flag_user', 'user', userId, { reason: reason || null });

  return { user_id: userId, is_flagged: true, flags: updatedFlags };
}

/**
 * Hard-delete a user. Cascades to all user data.
 */
export async function deleteUser(adminId, userId) {
  // Prevent self-deletion
  if (adminId === userId) throw badRequest('Cannot delete your own account via admin', 'SELF_DELETE');

  const { rows: [user] } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (!user) throw notFound('User not found', 'USER_NOT_FOUND');

  // Log before deleting so the audit row still exists
  await logAdminAction(adminId, 'delete_user', 'user', userId, {});

  await pool.query('DELETE FROM users WHERE id = $1', [userId]);

  return { user_id: userId, deleted: true };
}

// ─── Badge management ─────────────────────────────────────────────────────────

/**
 * Assign a badge to a user's profile.badges JSONB array.
 */
export async function assignBadge(adminId, userId, badgeId, badgeName) {
  const { rows: [profile] } = await pool.query(
    'SELECT badges FROM profiles WHERE user_id = $1',
    [userId]
  );
  if (!profile) throw notFound('User not found', 'USER_NOT_FOUND');

  const badges    = Array.isArray(profile.badges) ? profile.badges : [];
  const alreadyHas = badges.some((b) => b.id === badgeId);
  if (alreadyHas) throw conflict('Badge already assigned', 'BADGE_ALREADY_ASSIGNED');

  const newBadge = { id: badgeId, name: badgeName, awarded_at: new Date().toISOString() };
  const updated  = [...badges, newBadge];

  await pool.query('UPDATE profiles SET badges = $1 WHERE user_id = $2', [JSON.stringify(updated), userId]);
  await logAdminAction(adminId, 'assign_badge', 'user', userId, { badge_id: badgeId, badge_name: badgeName });

  return { user_id: userId, badges: updated };
}

/**
 * Remove a badge from a user's profile.badges JSONB array.
 */
export async function removeBadge(adminId, userId, badgeId) {
  const { rows: [profile] } = await pool.query(
    'SELECT badges FROM profiles WHERE user_id = $1',
    [userId]
  );
  if (!profile) throw notFound('User not found', 'USER_NOT_FOUND');

  const badges  = Array.isArray(profile.badges) ? profile.badges : [];
  const updated = badges.filter((b) => b.id !== badgeId);

  if (updated.length === badges.length) {
    throw notFound('Badge not found on this user', 'BADGE_NOT_FOUND');
  }

  await pool.query('UPDATE profiles SET badges = $1 WHERE user_id = $2', [JSON.stringify(updated), userId]);
  await logAdminAction(adminId, 'remove_badge', 'user', userId, { badge_id: badgeId });

  return { user_id: userId, badges: updated };
}

// ─── Pro subscription management ─────────────────────────────────────────────

/**
 * Grant a Pro subscription for N days.
 */
export async function grantPro(adminId, userId, days) {
  const { rows: [profile] } = await pool.query(
    'SELECT user_id FROM profiles WHERE user_id = $1',
    [userId]
  );
  if (!profile) throw notFound('User not found', 'USER_NOT_FOUND');

  const safeDays = Math.max(1, parseInt(days, 10) || 30);

  await pool.query(
    `UPDATE profiles
     SET subscription_status = 'pro',
         pro_expires_at      = now() + ($1 || ' days')::INTERVAL
     WHERE user_id = $2`,
    [safeDays, userId]
  );
  await logAdminAction(adminId, 'grant_pro', 'user', userId, { days: safeDays });

  return { user_id: userId, subscription_status: 'pro', days_granted: safeDays };
}

/**
 * Revoke a Pro subscription immediately.
 */
export async function revokePro(adminId, userId) {
  const { rows: [profile] } = await pool.query(
    'SELECT user_id, subscription_status FROM profiles WHERE user_id = $1',
    [userId]
  );
  if (!profile) throw notFound('User not found', 'USER_NOT_FOUND');
  if (profile.subscription_status === 'free') {
    throw badRequest('User does not have an active Pro subscription', 'NOT_PRO');
  }

  await pool.query(
    `UPDATE profiles
     SET subscription_status = 'free', pro_expires_at = NULL
     WHERE user_id = $1`,
    [userId]
  );
  await logAdminAction(adminId, 'revoke_pro', 'user', userId, {});

  return { user_id: userId, subscription_status: 'free' };
}

// ─── Promo codes ──────────────────────────────────────────────────────────────

/**
 * Create a new promo code (admin).
 */
export async function createPromoCode(adminId, { code, discount_pct, max_uses, grants_pro, pro_days, expires_at }) {
  const { rows } = await pool.query(
    `INSERT INTO promo_codes
       (code, discount_pct, max_uses, grants_pro, pro_days, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      code.toUpperCase().trim(),
      discount_pct ?? 0,
      max_uses     ?? 1,
      grants_pro   ?? false,
      pro_days     ?? 30,
      expires_at   || null,
      adminId,
    ]
  );

  await logAdminAction(adminId, 'create_promo_code', 'promo_code', rows[0].id, { code });

  return rows[0];
}

/**
 * List all promo codes with redemption stats.
 */
export async function listPromoCodes() {
  const { rows } = await pool.query(
    `SELECT pc.*,
            u.username AS created_by_username
     FROM promo_codes pc
     LEFT JOIN users u ON u.id = pc.created_by
     ORDER BY pc.created_at DESC`
  );
  return rows;
}

/**
 * Toggle is_active on a promo code.
 */
export async function togglePromoCode(adminId, codeId) {
  const { rows: [code] } = await pool.query(
    'SELECT id, is_active FROM promo_codes WHERE id = $1',
    [codeId]
  );
  if (!code) throw notFound('Promo code not found', 'PROMO_NOT_FOUND');

  const newState = !code.is_active;
  const { rows: [updated] } = await pool.query(
    'UPDATE promo_codes SET is_active = $1 WHERE id = $2 RETURNING *',
    [newState, codeId]
  );

  await logAdminAction(adminId, newState ? 'activate_promo_code' : 'deactivate_promo_code', 'promo_code', codeId, {});

  return updated;
}

/**
 * Redeem a promo code (end-user, not admin-only).
 * - Validates: active, not expired, uses < max_uses
 * - Prevents same user redeeming the same code twice
 * - Grants Pro subscription if grants_pro = true
 */
export async function redeemPromoCode(userId, rawCode) {
  const code = rawCode.toUpperCase().trim();

  const { rows: [promo] } = await pool.query(
    'SELECT * FROM promo_codes WHERE code = $1',
    [code]
  );

  if (!promo)            throw notFound('Promo code not found', 'PROMO_NOT_FOUND');
  if (!promo.is_active)  throw badRequest('Promo code is no longer active', 'PROMO_INACTIVE');
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    throw badRequest('Promo code has expired', 'PROMO_EXPIRED');
  }
  if (promo.uses >= promo.max_uses) {
    throw badRequest('Promo code has reached its usage limit', 'PROMO_EXHAUSTED');
  }

  // Per-user duplicate check
  const { rows: [existing] } = await pool.query(
    'SELECT id FROM promo_code_redemptions WHERE code_id = $1 AND user_id = $2',
    [promo.id, userId]
  );
  if (existing) throw conflict('You have already redeemed this code', 'ALREADY_REDEEMED');

  // Atomic: increment uses + insert redemption record in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE promo_codes SET uses = uses + 1 WHERE id = $1',
      [promo.id]
    );

    await client.query(
      'INSERT INTO promo_code_redemptions (code_id, user_id) VALUES ($1, $2)',
      [promo.id, userId]
    );

    if (promo.grants_pro) {
      await client.query(
        `UPDATE profiles
         SET subscription_status = 'pro',
             pro_expires_at      = GREATEST(COALESCE(pro_expires_at, now()), now())
                                   + ($1 || ' days')::INTERVAL
         WHERE user_id = $2`,
        [promo.pro_days, userId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    redeemed:        true,
    discount_pct:    promo.discount_pct,
    grants_pro:      promo.grants_pro,
    pro_days:        promo.grants_pro ? promo.pro_days : null,
    code:            promo.code,
  };
}

// ─── Logs & job retry ─────────────────────────────────────────────────────────

/**
 * List job logs with optional filters.
 */
export async function getLogs({ status, type, limit = 50, offset = 0 }) {
  const safeLimit  = Math.min(parseInt(limit,  10) || 50, 200);
  const safeOffset = parseInt(offset, 10) || 0;

  const conditions = [];
  const params     = [];
  let   idx        = 1;

  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
  if (type)   { conditions.push(`type   = $${idx++}`); params.push(type);   }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT id, type, status, progress_pct, error_message, user_id, attempts, created_at, updated_at
     FROM jobs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, safeLimit, safeOffset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM jobs ${where}`,
    params
  );

  return {
    logs:   rows,
    total:  parseInt(countResult.rows[0].count, 10),
    limit:  safeLimit,
    offset: safeOffset,
  };
}

/** Map job type to its background handler function. */
const JOB_HANDLERS = {
  resume_analyze:  resumeJobHandler,
  resume_roast:    resumeJobHandler,
  transcription:   transcriptionJobHandler,
  interview_score: interviewJobHandler,
};

/**
 * Re-enqueue a failed job by resetting its DB state and pushing it back into the queue.
 */
export async function retryJob(adminId, jobId) {
  const { rows: [job] } = await pool.query(
    'SELECT * FROM jobs WHERE id = $1',
    [jobId]
  );
  if (!job) throw notFound('Job not found', 'JOB_NOT_FOUND');
  if (job.status !== 'failed') {
    throw badRequest(`Job is not in failed state (current: ${job.status})`, 'JOB_NOT_FAILED');
  }

  const handler = JOB_HANDLERS[job.type];
  if (!handler) {
    throw badRequest(`No handler registered for job type '${job.type}'`, 'UNKNOWN_JOB_TYPE');
  }

  // Reset DB state
  await pool.query(
    `UPDATE jobs SET status = 'pending', attempts = 0, error_message = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId]
  );

  // Re-enqueue — pass existing jobId so the queue skips inserting a new row
  await jobQueue.enqueue(job.type, job.payload_ref, handler, { userId: job.user_id, jobId });

  await logAdminAction(adminId, 'retry_job', 'job', jobId, { job_type: job.type });

  return { requeued: true, job_id: jobId };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Minimal CSV serializer — no external dependency needed. */
function rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
}

/** Run the export query for the given type. */
async function fetchExportRows(exportType) {
  switch (exportType) {
    case 'users':
      return pool.query(
        'SELECT id, email, username, fullname, role, created_at FROM users ORDER BY created_at DESC'
      );

    case 'transcripts':
      return pool.query(
        `SELECT t.id, t.raw_text, t.asr_confidence, t.created_at, a.user_id
         FROM transcripts t
         JOIN audio_files a ON a.id = t.audio_id
         ORDER BY t.created_at DESC`
      );

    case 'contest_results':
      return pool.query(
        `SELECT cp.id, cp.contest_id, cp.user_id, cp.score, cp.rank, cp.joined_at, c.title
         FROM contest_participants cp
         JOIN contests c ON c.id = cp.contest_id
         ORDER BY cp.joined_at DESC`
      );

    case 'game_scores': {
      // game_scores table created in migration 007 — guard for environments where it may not exist yet
      try {
        return await pool.query(
          `SELECT gs.id, gs.game_id, gs.score, gs.combo, gs.hearts_left,
                  gs.time_taken_seconds, gs.created_at, u.username
           FROM game_scores gs
           JOIN users u ON u.id = gs.user_id
           ORDER BY gs.created_at DESC`
        );
      } catch {
        return { rows: [] };
      }
    }

    default:
      throw badRequest(`Unknown export type: ${exportType}`, 'INVALID_EXPORT_TYPE');
  }
}

/**
 * Trigger an async export job: insert pending row, fire-and-forget, return export_id immediately.
 */
export async function triggerExport(adminId, exportType) {
  const { rows: [exportRow] } = await pool.query(
    `INSERT INTO exports (requested_by, export_type) VALUES ($1, $2) RETURNING id`,
    [adminId, exportType]
  );
  const exportId = exportRow.id;

  // Fire-and-forget — do not await
  (async () => {
    try {
      const { rows } = await fetchExportRows(exportType);
      const csv       = rowsToCSV(rows);
      const buffer    = Buffer.from(csv, 'utf8');
      const publicId  = `kikoo/exports/${exportType}-${exportId}`;

      const { secureUrl } = await uploadBufferAsRaw(buffer, publicId, 'text/csv');

      await pool.query(
        `UPDATE exports SET status = 'done', file_url = $1 WHERE id = $2`,
        [secureUrl, exportId]
      );
    } catch (err) {
      console.error(`[export] Export ${exportId} failed:`, err?.message);
      await pool.query(
        `UPDATE exports SET status = 'failed', error_message = $1 WHERE id = $2`,
        [err?.message || 'Unknown error', exportId]
      ).catch(() => {});
    }
  })();

  await logAdminAction(adminId, 'trigger_export', 'export', exportId, { export_type: exportType });

  return { export_id: exportId, status: 'pending', message: 'Export started. Poll /admin/exports for status.' };
}

/**
 * List all exports (newest first).
 */
export async function listExports() {
  const { rows } = await pool.query(
    `SELECT e.*, u.username AS requested_by_username
     FROM exports e
     JOIN users u ON u.id = e.requested_by
     ORDER BY e.created_at DESC
     LIMIT 100`
  );
  return rows;
}
