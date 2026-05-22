import pool from '../db/pool.js';
import { UTC_TODAY_SQL } from './utcSql.js';

/** Bulk reset daily energy for all users whose last reset was before today (UTC). */
export async function resetAllStaleEnergy() {
  const { rowCount } = await pool.query(
    `UPDATE profiles
     SET daily_energy_count = 0, energy_reset_date = ${UTC_TODAY_SQL}
     WHERE energy_reset_date < ${UTC_TODAY_SQL}`
  );
  return rowCount;
}

/** Reset a single user's energy if their stored reset date is before today (UTC). */
export async function resetUserEnergyIfStale(userId) {
  const { rowCount } = await pool.query(
    `UPDATE profiles
     SET daily_energy_count = 0, energy_reset_date = ${UTC_TODAY_SQL}
     WHERE user_id = $1 AND energy_reset_date < ${UTC_TODAY_SQL}`,
    [userId]
  );
  return rowCount > 0;
}
