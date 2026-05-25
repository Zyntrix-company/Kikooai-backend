/**
 * Streak: at most one increment per UTC day; reset after missed days.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/db/pool.js';
import { checkStreakUpdate, toUtcDateString } from '../src/utils/streak.js';
import { UTC_TODAY_SQL } from '../src/utils/utcSql.js';
import { createTestUser, deleteTestUser } from './helpers.js';

describe('Streak updates', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('toUtcDateString parses Postgres DATE without locale drift', () => {
    const pgDate = new Date('2026-03-24T00:00:00.000Z');
    assert.equal(toUtcDateString(pgDate), '2026-03-24');
    assert.notEqual(String(pgDate).slice(0, 10), '2026-03-24');
  });

  it('increments at most once per UTC day', async () => {
    const userId = testUser.user.id;
    const minEnergy = parseInt(process.env.MIN_DAILY_ENERGY_FOR_STREAK || '10', 10);

    await pool.query(
      `UPDATE profiles
       SET daily_energy_count = $2, streak = 3,
           last_streak_update = (${UTC_TODAY_SQL} - 1)
       WHERE user_id = $1`,
      [userId, minEnergy]
    );

    await checkStreakUpdate(userId);
    const { rows: [afterFirst] } = await pool.query(
      'SELECT streak, last_streak_update FROM profiles WHERE user_id = $1',
      [userId]
    );
    assert.equal(afterFirst.streak, 4);

    await checkStreakUpdate(userId);
    const { rows: [afterSecond] } = await pool.query(
      'SELECT streak, last_streak_update FROM profiles WHERE user_id = $1',
      [userId]
    );
    assert.equal(afterSecond.streak, 4, 'second call same day must not increment');
  });

  it('resets streak to 1 after a gap (not consecutive)', async () => {
    const userId = testUser.user.id;
    const minEnergy = parseInt(process.env.MIN_DAILY_ENERGY_FOR_STREAK || '10', 10);

    await pool.query(
      `UPDATE profiles
       SET daily_energy_count = $2, streak = 12,
           last_streak_update = (${UTC_TODAY_SQL} - 5)
       WHERE user_id = $1`,
      [userId, minEnergy]
    );

    await checkStreakUpdate(userId);
    const { rows: [row] } = await pool.query(
      'SELECT streak FROM profiles WHERE user_id = $1',
      [userId]
    );
    assert.equal(row.streak, 1);
  });
});
