/**
 * Exercise tests.
 * Pre-requisite: npm run seed (exercise seeds must be in DB).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

const EXERCISE_TYPES = [
  'fillup', 'jumbled_word', 'jumbled_sentence', 'vocab',
  'synonyms', 'antonyms', 'pronunciation_spelling',
];

describe('Exercises', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('GET /exercises/fillup/seed → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/exercises/fillup/seed`);
    assert.equal(res.status, 401);
  });

  it('POST /exercises/fillup/submit → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/exercises/fillup/submit`)
      .send({ seed_id: '00000000-0000-0000-0000-000000000000', user_answer: 'x' });
    assert.equal(res.status, 401);
  });

  // ── Type validation ─────────────────────────────────────────────────────────

  it('GET /exercises/invalid/seed → 400 INVALID_TYPE', async () => {
    const res = await request(app)
      .get(`${BASE}/exercises/invalid_type/seed`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_TYPE');
  });

  it('GET /exercises/fillup/seed?difficulty=impossible → 400 INVALID_DIFFICULTY', async () => {
    const res = await request(app)
      .get(`${BASE}/exercises/fillup/seed?difficulty=impossible`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_DIFFICULTY');
  });

  it('POST /exercises/invalid/submit → 400 INVALID_TYPE', async () => {
    const res = await request(app)
      .post(`${BASE}/exercises/invalid_type/submit`)
      .set(bearer(testUser.accessToken))
      .send({ seed_id: '00000000-0000-0000-0000-000000000000', user_answer: 'test' });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_TYPE');
  });

  // ── Submit validation ───────────────────────────────────────────────────────

  it('POST /exercises/fillup/submit → 400 when seed_id missing', async () => {
    const res = await request(app)
      .post(`${BASE}/exercises/fillup/submit`)
      .set(bearer(testUser.accessToken))
      .send({ user_answer: 'goes' });

    assert.equal(res.status, 400);
  });

  it('POST /exercises/fillup/submit → 400 when user_answer missing', async () => {
    const res = await request(app)
      .post(`${BASE}/exercises/fillup/submit`)
      .set(bearer(testUser.accessToken))
      .send({ seed_id: '00000000-0000-0000-0000-000000000000' });

    assert.equal(res.status, 400);
  });

  // ── Seed + submit happy path ────────────────────────────────────────────────

  for (const type of EXERCISE_TYPES) {
    it(`GET /exercises/${type}/seed → 200 with seed.id and stripped answer_key`, async () => {
      const res = await request(app)
        .get(`${BASE}/exercises/${type}/seed`)
        .set(bearer(testUser.accessToken));

      // 200 = has seed; 404 = no data seeded for this type (both acceptable)
      assert.ok([200, 404].includes(res.status), `Unexpected status ${res.status} for type ${type}`);

      if (res.status === 200) {
        assert.ok(res.body.data.seed.id,         'Missing seed.id');
        assert.ok(res.body.data.seed.type,        'Missing seed.type');
        assert.ok(res.body.data.seed.payload,     'Missing seed.payload');
        assert.ok(!('answer_key' in res.body.data.seed.payload), 'answer_key must not be exposed to client');
      }
    });
  }

  it('POST /exercises/fillup/submit → 200 or 402 with a real seed_id', async () => {
    // Get a seed first
    const seedRes = await request(app)
      .get(`${BASE}/exercises/fillup/seed`)
      .set(bearer(testUser.accessToken));

    if (seedRes.status === 404) {
      // No seeds in DB — skip
      return;
    }
    assert.equal(seedRes.status, 200);
    const seedId = seedRes.body.data.seed.id;

    const res = await request(app)
      .post(`${BASE}/exercises/fillup/submit`)
      .set(bearer(testUser.accessToken))
      .send({ seed_id: seedId, user_answer: 'goes' });

    assert.ok(
      [200, 402].includes(res.status),
      `Expected 200 or 402, got ${res.status}: ${JSON.stringify(res.body)}`
    );

    if (res.status === 200) {
      assert.ok(typeof res.body.data.is_correct === 'boolean', 'Missing is_correct field');
      assert.ok(typeof res.body.data.score      === 'number',  'Missing score field');
    }
  });

  // ── Speaking prompt endpoint ────────────────────────────────────────────────

  it('GET /exercises/speaking/prompt → 200 or 404', async () => {
    const res = await request(app)
      .get(`${BASE}/exercises/speaking/prompt`)
      .set(bearer(testUser.accessToken));

    assert.ok([200, 404].includes(res.status), `Unexpected status ${res.status}`);
  });
});
