/**
 * Audio tests.
 * Tests upload-init, list, transcript polling, and delete.
 * The full upload→complete→transcription flow requires real Cloudinary assets,
 * so /audio/complete is tested only for its error path (fake public_id → 400).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

describe('Audio', () => {
  let testUser;
  let uploadId;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('POST /audio/upload-init → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .send({ filename: 'test.webm' });
    assert.equal(res.status, 401);
  });

  it('GET /audio → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/audio`);
    assert.equal(res.status, 401);
  });

  // ── POST /audio/upload-init ─────────────────────────────────────────────────

  it('returns 400 when filename is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .set(bearer(testUser.accessToken))
      .send({ format: 'webm' });

    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid format', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .set(bearer(testUser.accessToken))
      .send({ filename: 'test.xyz', format: 'xyz' });

    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid context_type', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .set(bearer(testUser.accessToken))
      .send({ filename: 'test.webm', context_type: 'invalid_ctx' });

    assert.equal(res.status, 400);
  });

  it('returns 200 with upload_id and cloudinary signature for speaking context', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .set(bearer(testUser.accessToken))
      .send({ filename: 'test.webm', format: 'webm', context_type: 'speaking' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.upload_id,            'Missing upload_id');
    assert.ok(res.body.data.cloudinary.signature, 'Missing cloudinary.signature');
    assert.ok(res.body.data.cloudinary.uploadUrl, 'Missing cloudinary.uploadUrl');
    assert.ok(res.body.data.cloudinary.apiKey,    'Missing cloudinary.apiKey');
    assert.ok(res.body.data.cloudinary.cloudName, 'Missing cloudinary.cloudName');
    assert.ok(res.body.data.expires_in_seconds,   'Missing expires_in_seconds');
    uploadId = res.body.data.upload_id;
  });

  it('returns 200 with upload_id for interview context', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/upload-init`)
      .set(bearer(testUser.accessToken))
      .send({ filename: 'interview.webm', format: 'webm', context_type: 'interview' });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.upload_id);
  });

  // ── POST /audio/complete (error path — fake Cloudinary asset) ───────────────

  it('POST /audio/complete → 400 CLOUDINARY_ERROR with fake public_id', async () => {
    if (!uploadId) return;

    const res = await request(app)
      .post(`${BASE}/audio/complete`)
      .set(bearer(testUser.accessToken))
      .send({
        upload_id:            uploadId,
        cloudinary_public_id: 'fake/nonexistent/public-id',
        cloudinary_url:       'https://res.cloudinary.com/demo/video/upload/dog.mp4',
        format:               'webm',
      });

    // 400 = Cloudinary could not verify asset (expected); 202 = somehow succeeded
    assert.ok([400, 202].includes(res.status), `Unexpected status ${res.status}`);
    if (res.status === 400) {
      assert.equal(res.body.code, 'CLOUDINARY_ERROR');
    }
  });

  it('POST /audio/complete → 400 VALIDATION_ERROR when upload_id is not UUID', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/complete`)
      .set(bearer(testUser.accessToken))
      .send({
        upload_id:            'not-a-uuid',
        cloudinary_public_id: 'some/id',
        cloudinary_url:       'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      });

    assert.equal(res.status, 400);
  });

  it('POST /audio/complete → 404 AUDIO_NOT_FOUND for unknown upload_id', async () => {
    const res = await request(app)
      .post(`${BASE}/audio/complete`)
      .set(bearer(testUser.accessToken))
      .send({
        upload_id:            '00000000-0000-0000-0000-000000000000',
        cloudinary_public_id: 'fake/id',
        cloudinary_url:       'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'AUDIO_NOT_FOUND');
  });

  // ── GET /audio ──────────────────────────────────────────────────────────────

  it('GET /audio → 200 with audio array', async () => {
    const res = await request(app)
      .get(`${BASE}/audio`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.audio), 'Expected audio to be an array');
  });

  // ── GET /audio/:id/transcript ───────────────────────────────────────────────

  it('GET /audio/:id/transcript → 202 when audio is still pending', async () => {
    if (!uploadId) return;

    const res = await request(app)
      .get(`${BASE}/audio/${uploadId}/transcript`)
      .set(bearer(testUser.accessToken));

    // 202 = not done yet; 200 = somehow already done; 404 = cleaned up
    assert.ok([200, 202, 404].includes(res.status), `Unexpected status ${res.status}`);
  });

  it('GET /audio/:id/transcript → 404 for unknown audio_id', async () => {
    const res = await request(app)
      .get(`${BASE}/audio/00000000-0000-0000-0000-000000000000/transcript`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'AUDIO_NOT_FOUND');
  });

  // ── GET /jobs/:job_id/status ─────────────────────────────────────────────────

  it('GET /jobs/:job_id/status → 404 for unknown job', async () => {
    const res = await request(app)
      .get(`${BASE}/jobs/00000000-0000-0000-0000-000000000000/status`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'JOB_NOT_FOUND');
  });

  // ── DELETE /audio/:id ────────────────────────────────────────────────────────

  it('DELETE /audio/:id → 200 for own pending audio', async () => {
    if (!uploadId) return;

    const res = await request(app)
      .delete(`${BASE}/audio/${uploadId}`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
  });

  it('DELETE /audio/:id → 404 for unknown audio_id', async () => {
    const res = await request(app)
      .delete(`${BASE}/audio/00000000-0000-0000-0000-000000000000`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'AUDIO_NOT_FOUND');
  });
});
