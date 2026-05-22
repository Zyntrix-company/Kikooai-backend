/**
 * Energy reset at 00:00 UTC boundary.
 * Pre-requisite: DATABASE_URL set and migrations applied.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/pool.js';
import app from '../src/app.js';
import { resetAllStaleEnergy, resetUserEnergyIfStale } from '../src/utils/energyReset.js';
import { UTC_TODAY_SQL } from '../src/utils/utcSql.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

describe('Energy reset (UTC)', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('resetUserEnergyIfStale clears energy when energy_reset_date is yesterday (UTC)', async () => {
    const userId = testUser.user.id;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const ymd = yesterday.toISOString().slice(0, 10);

    await pool.query(
      `UPDATE profiles SET daily_energy_count = 50, energy_reset_date = $2::date WHERE user_id = $1`,
      [userId, ymd]
    );

    const reset = await resetUserEnergyIfStale(userId);
    assert.equal(reset, true);

    const { rows: [profile] } = await pool.query(
      `SELECT daily_energy_count, energy_reset_date FROM profiles WHERE user_id = $1`,
      [userId]
    );
    assert.equal(profile.daily_energy_count, 0);

    const { rows: [todayRow] } = await pool.query(`SELECT ${UTC_TODAY_SQL} AS today`);
    assert.equal(String(profile.energy_reset_date).slice(0, 10), String(todayRow.today).slice(0, 10));
  });

  it('resetAllStaleEnergy resets profiles with a stale reset date', async () => {
    const userId = testUser.user.id;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const ymd = yesterday.toISOString().slice(0, 10);

    await pool.query(
      `UPDATE profiles SET daily_energy_count = 25, energy_reset_date = $2::date WHERE user_id = $1`,
      [userId, ymd]
    );

    const count = await resetAllStaleEnergy();
    assert.ok(count >= 1);

    const { rows: [profile] } = await pool.query(
      'SELECT daily_energy_count, energy_reset_date FROM profiles WHERE user_id = $1',
      [userId]
    );
    assert.equal(profile.daily_energy_count, 0);
  });

  it('GET /users/me shows daily_energy_count 0 after stale reset date', async () => {
    const userId = testUser.user.id;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    await pool.query(
      `UPDATE profiles SET daily_energy_count = 50, energy_reset_date = $2::date WHERE user_id = $1`,
      [userId, yesterday.toISOString().slice(0, 10)]
    );

    const res = await request(app)
      .get(`${BASE}/users/me`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.daily_energy_count, 0);
  });
});
