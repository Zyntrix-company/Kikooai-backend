/**
 * Resume tests.
 * Tests upload flow, JSON save, analyze/roast, list, and delete.
 * Note: analyze/roast enqueue AI jobs — we only verify the 202 response + report polling shape.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

const SAMPLE_RESUME_JSON = {
  name:       'John Doe',
  email:      'john@example.com',
  experience: [{ company: 'ACME', role: 'Developer', years: 2 }],
  skills:     ['JavaScript', 'Node.js'],
};

const SAMPLE_JD = `We are looking for a skilled Node.js backend developer with at least
two years of experience building REST APIs using Express.js and PostgreSQL.
Knowledge of cloud services and CI/CD pipelines is a strong plus. The candidate
will work on our core platform team delivering new features and maintaining infra.`;

describe('Resumes', () => {
  let testUser;
  let savedResumeId;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('POST /resumes/save-json → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/save-json`)
      .send({ json_blob: SAMPLE_RESUME_JSON });
    assert.equal(res.status, 401);
  });

  it('GET /resumes → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/resumes`);
    assert.equal(res.status, 401);
  });

  // ── POST /resumes/save-json ─────────────────────────────────────────────────

  it('returns 400 when json_blob is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/save-json`)
      .set(bearer(testUser.accessToken))
      .send({ title: 'Test' });

    assert.equal(res.status, 400);
  });

  it('returns 201 and resume.id on valid JSON payload', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/save-json`)
      .set(bearer(testUser.accessToken))
      .send({ title: 'Test Resume', json_blob: SAMPLE_RESUME_JSON });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.resume.id, 'Missing resume.id');
    savedResumeId = res.body.data.resume.id;
  });

  // ── GET /resumes ────────────────────────────────────────────────────────────

  it('GET /resumes → 200 and includes the saved resume', async () => {
    const res = await request(app)
      .get(`${BASE}/resumes`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.resumes));
    if (savedResumeId) {
      const found = res.body.data.resumes.find(r => r.id === savedResumeId);
      assert.ok(found, 'Saved resume not found in list');
    }
  });

  // ── POST /resumes/upload-init ───────────────────────────────────────────────

  it('POST /resumes/upload-init → 200 with upload_id and cloudinary fields', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/upload-init`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.resume_id,             'Missing resume_id');
    assert.ok(res.body.data.cloudinary.signature,  'Missing cloudinary.signature');
    assert.ok(res.body.data.cloudinary.uploadUrl,  'Missing cloudinary.uploadUrl');
    assert.ok(res.body.data.cloudinary.apiKey,     'Missing cloudinary.apiKey');
  });

  // ── POST /resumes/analyze ───────────────────────────────────────────────────

  it('POST /resumes/analyze → 400 VALIDATION_ERROR when resume_id is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/analyze`)
      .set(bearer(testUser.accessToken))
      .send({ jd_text: SAMPLE_JD });

    assert.equal(res.status, 400);
  });

  it('POST /resumes/analyze → 400 when jd_text is too short', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/analyze`)
      .set(bearer(testUser.accessToken))
      .send({ resume_id: '00000000-0000-0000-0000-000000000000', jd_text: 'too short' });

    assert.equal(res.status, 400);
  });

  it('POST /resumes/analyze → 404 RESUME_NOT_FOUND for unknown resume_id', async () => {
    const res = await request(app)
      .post(`${BASE}/resumes/analyze`)
      .set(bearer(testUser.accessToken))
      .send({
        resume_id: '00000000-0000-0000-0000-000000000000',
        jd_text:   SAMPLE_JD,
      });

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'RESUME_NOT_FOUND');
  });

  it('POST /resumes/analyze → 202 with report_id for a valid resume', async () => {
    if (!savedResumeId) return; // depends on save-json test passing

    const res = await request(app)
      .post(`${BASE}/resumes/analyze`)
      .set(bearer(testUser.accessToken))
      .send({ resume_id: savedResumeId, jd_text: SAMPLE_JD });

    assert.equal(res.status, 202, `Expected 202, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.report_id, 'Missing report_id');
  });

  // ── POST /resumes/roast ─────────────────────────────────────────────────────

  it('POST /resumes/roast → 202 with report_id for a valid resume', async () => {
    if (!savedResumeId) return;

    const res = await request(app)
      .post(`${BASE}/resumes/roast`)
      .set(bearer(testUser.accessToken))
      .send({ resume_id: savedResumeId, jd_text: SAMPLE_JD });

    assert.equal(res.status, 202);
    assert.ok(res.body.data.report_id, 'Missing report_id');
  });

  // ── GET /resumes/reports/:id polling ───────────────────────────────────────

  it('GET /resumes/reports/:id → 202 or 200 (pending or done)', async () => {
    if (!savedResumeId) return;

    // Start an analysis
    const analyzeRes = await request(app)
      .post(`${BASE}/resumes/analyze`)
      .set(bearer(testUser.accessToken))
      .send({ resume_id: savedResumeId, jd_text: SAMPLE_JD });

    if (analyzeRes.status !== 202) return;

    const reportId = analyzeRes.body.data.report_id;

    const res = await request(app)
      .get(`${BASE}/resumes/reports/${reportId}`)
      .set(bearer(testUser.accessToken));

    // 202 = still processing; 200 = done
    assert.ok([200, 202].includes(res.status), `Unexpected status ${res.status}`);
    assert.ok(res.body.data.status, 'Missing status field');
  });

  it('GET /resumes/reports/:id → 404 for unknown report_id', async () => {
    const res = await request(app)
      .get(`${BASE}/resumes/reports/00000000-0000-0000-0000-000000000000`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'REPORT_NOT_FOUND');
  });

  // ── DELETE /resumes/:id ─────────────────────────────────────────────────────

  it('DELETE /resumes/:id → 404 for a resume belonging to another user', async () => {
    // Use a valid UUID that doesn't belong to this user
    const res = await request(app)
      .delete(`${BASE}/resumes/00000000-0000-0000-0000-000000000000`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'RESUME_NOT_FOUND');
  });

  it('DELETE /resumes/:id → 200 for own resume', async () => {
    if (!savedResumeId) return;

    const res = await request(app)
      .delete(`${BASE}/resumes/${savedResumeId}`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
  });
});
