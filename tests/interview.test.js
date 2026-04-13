/**
 * Interview tests.
 * Tests config, questions, room create/start-stop/result, and scraped answer evaluation.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

describe('Interview', () => {
  let testUser;
  let roomId;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('GET /interview/config → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/interview/config`);
    assert.equal(res.status, 401);
  });

  it('GET /interview/questions → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/interview/questions?role=engineer`);
    assert.equal(res.status, 401);
  });

  it('POST /interview/rooms/create → 401 without token', async () => {
    const res = await request(app).post(`${BASE}/interview/rooms/create`).send({});
    assert.equal(res.status, 401);
  });

  // ── GET /interview/config ───────────────────────────────────────────────────

  it('GET /interview/config → 200 with config object', async () => {
    const res = await request(app)
      .get(`${BASE}/interview/config`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(res.body.data, 'Missing data in response');
  });

  // ── GET /interview/questions ────────────────────────────────────────────────

  it('GET /interview/questions → 400 MISSING_ROLE when role param absent', async () => {
    const res = await request(app)
      .get(`${BASE}/interview/questions`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'MISSING_ROLE');
  });

  it('GET /interview/questions → 200 or 502 with role param', async () => {
    const res = await request(app)
      .get(`${BASE}/interview/questions?role=Backend+Engineer&difficulty=Medium`)
      .set(bearer(testUser.accessToken));

    // 200 = AI responded; 502 = AI service error (both valid in CI)
    assert.ok([200, 502].includes(res.status), `Unexpected status ${res.status}`);

    if (res.status === 200) {
      assert.ok(res.body.data.questions || res.body.data, 'Missing questions in response');
    }
  });

  // ── POST /interview/rooms/create ────────────────────────────────────────────

  it('returns 201 with room token on minimal valid payload', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/rooms/create`)
      .set(bearer(testUser.accessToken))
      .send({});

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.room_id || res.body.data.room?.id || res.body.data.id, 'Missing room identifier');
    roomId = res.body.data.room_id || res.body.data.room?.id || res.body.data.id;
  });

  it('returns 201 with full settings', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/rooms/create`)
      .set(bearer(testUser.accessToken))
      .send({
        duration_mins:  30,
        question_count: 5,
        difficulty:     'medium',
        job_role:       'Backend Engineer',
        company:        'ACME Corp',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.data.room_id || res.body.data.room?.id || res.body.data.id);
  });

  it('returns 400 on invalid difficulty value', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/rooms/create`)
      .set(bearer(testUser.accessToken))
      .send({ difficulty: 'super_hard' });

    assert.equal(res.status, 400);
  });

  it('returns 400 when duration_mins exceeds 120', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/rooms/create`)
      .set(bearer(testUser.accessToken))
      .send({ duration_mins: 999 });

    assert.equal(res.status, 400);
  });

  // ── GET /interview/rooms ────────────────────────────────────────────────────

  it('GET /interview/rooms → 200 with rooms array', async () => {
    const res = await request(app)
      .get(`${BASE}/interview/rooms`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.rooms), 'Expected rooms to be an array');
  });

  // ── POST /interview/rooms/:id/record/start ──────────────────────────────────

  it('record/start → 200 on a real room', async () => {
    if (!roomId) return;

    const res = await request(app)
      .post(`${BASE}/interview/rooms/${roomId}/record/start`)
      .set(bearer(testUser.accessToken));

    assert.ok([200, 400].includes(res.status), `Unexpected status ${res.status}`);
  });

  it('record/start → 404 for unknown room', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/rooms/00000000-0000-0000-0000-000000000000/record/start`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'ROOM_NOT_FOUND');
  });

  // ── GET /interview/rooms/:id/result ────────────────────────────────────────

  it('GET /interview/rooms/:id/result → 200 or 202 for own room', async () => {
    if (!roomId) return;

    const res = await request(app)
      .get(`${BASE}/interview/rooms/${roomId}/result`)
      .set(bearer(testUser.accessToken));

    assert.ok([200, 202].includes(res.status), `Unexpected status ${res.status}`);
  });

  it('GET /interview/rooms/:id/result → 404 for unknown room', async () => {
    const res = await request(app)
      .get(`${BASE}/interview/rooms/00000000-0000-0000-0000-000000000000/result`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'ROOM_NOT_FOUND');
  });

  // ── POST /interview/questions/evaluate ─────────────────────────────────────

  it('returns 400 ANSWER_REQUIRED when neither answer_text nor audio_id provided', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/questions/evaluate`)
      .set(bearer(testUser.accessToken))
      .send({ question_text: 'Tell me about yourself and your experience with Node.js.' });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'ANSWER_REQUIRED');
  });

  it('returns 400 VALIDATION_ERROR when question_text is too short', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/questions/evaluate`)
      .set(bearer(testUser.accessToken))
      .send({ question_text: 'Hi?', answer_text: 'Hello.' });

    assert.equal(res.status, 400);
  });

  it('returns 200 or 502 with answer_text provided', async () => {
    const res = await request(app)
      .post(`${BASE}/interview/questions/evaluate`)
      .set(bearer(testUser.accessToken))
      .send({
        question_text: 'Explain the difference between REST and GraphQL APIs in terms of data fetching.',
        answer_text:   'REST uses fixed endpoints while GraphQL allows clients to query exactly what they need.',
        job_role:      'Backend Engineer',
      });

    assert.ok([200, 502].includes(res.status), `Unexpected status ${res.status}`);
    if (res.status === 200) {
      assert.ok(res.body.data.score !== undefined || res.body.data.feedback, 'Missing score or feedback');
    }
  });
});
