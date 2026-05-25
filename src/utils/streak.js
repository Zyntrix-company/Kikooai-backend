import pool from '../db/pool.js';
import { UTC_TODAY_SQL } from './utcSql.js';

const MILESTONES = {
  7:   { id: 'streak_7',   name: '7-Day Streak' },
  30:  { id: 'streak_30',  name: '30-Day Streak' },
  100: { id: 'streak_100', name: '100-Day Streak' },
};

/** Normalize a DATE/timestamp from Postgres or JSON to `YYYY-MM-DD` (UTC). */
export function toUtcDateString(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Award at most one streak increment per UTC calendar day when daily_energy_count
 * meets MIN_DAILY_ENERGY_FOR_STREAK. Consecutive days increment; gaps reset to 1.
 */
export async function checkStreakUpdate(userId) {
  const MIN_ENERGY = parseInt(process.env.MIN_DAILY_ENERGY_FOR_STREAK || '10', 10);

  const { rows } = await pool.query(
    `UPDATE profiles
     SET streak = CASE
           WHEN last_streak_update = (${UTC_TODAY_SQL} - 1) THEN streak + 1
           ELSE 1
         END,
         last_streak_update = ${UTC_TODAY_SQL},
         xp = xp + (
           CASE
             WHEN last_streak_update = (${UTC_TODAY_SQL} - 1) THEN streak + 1
             ELSE 1
           END
         ) * 5
     WHERE user_id = $1
       AND daily_energy_count >= $2
       AND (last_streak_update IS NULL OR last_streak_update < ${UTC_TODAY_SQL})
     RETURNING streak, badges`,
    [userId, MIN_ENERGY]
  );

  if (rows.length === 0) return;

  const { streak, badges: rawBadges } = rows[0];
  const milestone = MILESTONES[streak];
  if (!milestone) return;

  const badges = Array.isArray(rawBadges) ? rawBadges : [];
  if (badges.some((b) => b.id === milestone.id)) return;

  await pool.query(
    'UPDATE profiles SET badges = $1 WHERE user_id = $2',
    [JSON.stringify([...badges, { ...milestone, awarded_at: new Date().toISOString() }]), userId]
  );
}
