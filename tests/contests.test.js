/**
 * Contest tests.
 * Pre-requisite: npm run seed:users (admin@kikoo.test must exist).
 * Admin creates a contest; regular user joins, submits score, checks leaderboard.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import {
  BASE, createTestUser, deleteTestUser,
  loginAdmin, bearer,
} from './helpers.js';

describe('Contests', () => {
  let testUser;
  let adminToken;
  let contestToken;

  before(async () => {
    [testUser, { accessToken: adminToken }] = await Promise.all([
      createTestUser(),
      loginAdmin(),
    ]);

    // Admin creates a contest to use in subsequent tests
    const now     = new Date();
    const endTs   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const startTs = now.toISOString();

    const res = await request(app)
      .post(`${BASE}/contests`)
      .set(bearer(adminToken))
      .send({
        title:      `Test Contest ${Date.now()}`,
        game_type:  'conexo',
        start_ts:   startTs,
        end_ts:     endTs,
        prize_info: { prize_type: 'certificate' },
        settings:   { randomize_seed: true },
      });

    if (res.status === 201) {
      contestToken = res.body.data.contest.token;
    }
  });

  after(async () => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('GET /contests → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/contests`);
    assert.equal(res.status, 401);
  });

  it('POST /contests → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/contests`)
      .send({ title: 'Test', game_type: 'conexo' });
    assert.equal(res.status, 401);
  });

  // ── Admin guard ─────────────────────────────────────────────────────────────

  it('POST /contests → 403 for a non-admin user', async () => {
    const res = await request(app)
      .post(`${BASE}/contests`)
      .set(bearer(testUser.accessToken))
      .send({ title: 'Unauthorized Contest', game_type: 'conexo' });

    assert.equal(res.status, 403);
  });

  // ── POST /contests (admin) ──────────────────────────────────────────────────

  it('POST /contests → 400 when title is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/contests`)
      .set(bearer(adminToken))
      .send({ game_type: 'conexo' });

    assert.equal(res.status, 400);
  });

  it('POST /contests → 400 when game_type is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/contests`)
      .set(bearer(adminToken))
      .send({ title: 'Missing Type Contest' });

    assert.equal(res.status, 400);
  });

  it('POST /contests → 201 with contest.token for valid payload', async () => {
    const now   = new Date();
    const endTs = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .post(`${BASE}/contests`)
      .set(bearer(adminToken))
      .send({
        title:     `Valid Contest ${Date.now()}`,
        game_type: 'word_blitz',
        end_ts:    endTs,
      });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.contest.token,      'Missing contest.token');
    assert.ok(res.body.data.contest.share_link, 'Missing contest.share_link');
    assert.ok(res.body.data.contest.id,         'Missing contest.id');
  });

  // ── GET /contests ────────────────────────────────────────────────────────────

  it('GET /contests → 200 with contests array', async () => {
    const res = await request(app)
      .get(`${BASE}/contests`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.contests), 'Expected contests to be an array');
  });

  it('GET /contests respects limit query param', async () => {
    const res = await request(app)
      .get(`${BASE}/contests?limit=2`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(res.body.data.contests.length <= 2, 'Limit not respected');
  });

  // ── POST /contests/:token/join ───────────────────────────────────────────────

  it('join → 404 for unknown contest token', async () => {
    const res = await request(app)
      .post(`${BASE}/contests/totally-fake-token/join`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'CONTEST_NOT_FOUND');
  });

  it('join → 201 for a valid contest token', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/join`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.share_link || res.body.data.participant_token || res.body.data, 'Missing join response data');
  });

  it('join → 409 ALREADY_JOINED if joining again', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/join`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'ALREADY_JOINED');
  });

  // ── GET /contests/:token/leaderboard ────────────────────────────────────────

  it('leaderboard → 200 with entries array', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .get(`${BASE}/contests/${contestToken}/leaderboard`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data.leaderboard), 'Expected leaderboard to be an array');
  });

  it('leaderboard → 404 for unknown token', async () => {
    const res = await request(app)
      .get(`${BASE}/contests/totally-fake-token/leaderboard`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'CONTEST_NOT_FOUND');
  });

  // ── POST /contests/:token/score ─────────────────────────────────────────────

  it('score → 400 VALIDATION_ERROR when score is missing', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/score`)
      .set(bearer(testUser.accessToken))
      .send({});

    assert.equal(res.status, 400);
  });

  it('score → 200 for a participant', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/score`)
      .set(bearer(testUser.accessToken))
      .send({ score: 1200, metadata: { combo: 2 } });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('score → 403 NOT_A_PARTICIPANT for a user who has not joined', async () => {
    if (!contestToken) return;

    const outsider = await createTestUser();

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/score`)
      .set(bearer(outsider.accessToken))
      .send({ score: 500 });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'NOT_A_PARTICIPANT');

    await deleteTestUser(outsider.accessToken);
  });

  // ── POST /contests/:token/complete (admin only) ─────────────────────────────

  it('complete → 403 for a non-admin user', async () => {
    if (!contestToken) return;

    const res = await request(app)
      .post(`${BASE}/contests/${contestToken}/complete`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 403);
  });
});
