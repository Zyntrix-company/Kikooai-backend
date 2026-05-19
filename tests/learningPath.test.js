import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

const TASK_ID = '11111111-1111-1111-1111-111111111111';

describe('Learning Path', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  it('GET /learning-path/status → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/learning-path/status`);
    assert.equal(res.status, 401);
  });

  it('POST /learning-path/complete-task → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .send({ task_id: TASK_ID, day: 1 });
    assert.equal(res.status, 401);
  });

  // ── GET status (first call creates a cycle) ─────────────────────────────────

  it('GET /learning-path/status → 200 with correct shape', async () => {
    const res = await request(app)
      .get(`${BASE}/learning-path/status`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const { current_day, days_remaining, completed_tasks, is_locked } = res.body.data;
    assert.equal(current_day, 1);
    assert.equal(days_remaining, 29);
    assert.deepEqual(completed_tasks, []);
    assert.equal(is_locked, false);
  });

  // ── Complete a task ─────────────────────────────────────────────────────────

  it('POST /learning-path/complete-task → 200 with task_id + day', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: TASK_ID, day: 1 });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.task_id, TASK_ID);
    assert.equal(res.body.data.day, 1);
  });

  it('GET /learning-path/status → completed_tasks includes the submitted task', async () => {
    const res = await request(app)
      .get(`${BASE}/learning-path/status`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(res.body.data.completed_tasks.includes(TASK_ID));
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('POST /learning-path/complete-task with same task_id → 200 (idempotent)', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: TASK_ID, day: 1 });

    assert.equal(res.status, 200);
  });

  // ── Validation errors ───────────────────────────────────────────────────────

  it('POST /learning-path/complete-task → 400 when task_id missing', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ day: 1 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('POST /learning-path/complete-task → 400 when task_id is not a UUID', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: 'not-a-uuid', day: 1 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('POST /learning-path/complete-task → 400 when day > 30', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: TASK_ID, day: 31 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('POST /learning-path/complete-task → 400 when day < 1', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: TASK_ID, day: 0 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('POST /learning-path/complete-task → 400 when day missing', async () => {
    const res = await request(app)
      .post(`${BASE}/learning-path/complete-task`)
      .set(bearer(testUser.accessToken))
      .send({ task_id: TASK_ID });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });
});
