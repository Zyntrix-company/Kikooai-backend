/**
 * Seed deduplication tests.
 * Pre-requisite: npm run seed (exercise + game seeds in DB).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

describe('Seed deduplication', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('GET /exercises/fillup/seed twice returns different seeds without submit', async () => {
    const seed1Res = await request(app)
      .get(`${BASE}/exercises/fillup/seed?difficulty=easy`)
      .set(bearer(testUser.accessToken));

    if (seed1Res.status === 404) return;

    assert.equal(seed1Res.status, 200);
    const seed1Id = seed1Res.body.data.seed.id;

    const seed2Res = await request(app)
      .get(`${BASE}/exercises/fillup/seed?difficulty=easy`)
      .set(bearer(testUser.accessToken));

    assert.equal(seed2Res.status, 200);
    const seed2Id = seed2Res.body.data.seed.id;

    assert.notEqual(seed1Id, seed2Id, 'consecutive fetches must not return the same seed');
  });

  it('GET /assignments/daily returns unique seed IDs within the set', async () => {
    const res = await request(app)
      .get(`${BASE}/assignments/daily`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    const ids = res.body.data.assignments.map((a) => a.seed.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'daily assignments must not repeat the same seed');
  });

  it('GET /games/conexo/seed returns 200 or 404 with answer_key stripped', async () => {
    const res = await request(app)
      .get(`${BASE}/games/conexo/seed`)
      .set(bearer(testUser.accessToken));

    assert.ok([200, 404].includes(res.status));
    if (res.status === 200) {
      assert.ok(!('answer_key' in res.body.data.game.seed_json));
    }
  });
});
