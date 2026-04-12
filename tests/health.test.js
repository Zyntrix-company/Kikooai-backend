import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('GET /healthz', () => {
  it('returns 200 or 503 with expected shape', async () => {
    const res = await request(app).get('/healthz');

    assert.ok([200, 503].includes(res.status), `Unexpected status ${res.status}`);
    assert.ok(res.body.status === 'ok' || res.body.status === 'degraded');
    assert.ok(typeof res.body.ts === 'string');
    assert.ok(res.body.checks);
    assert.ok(res.body.checks.database);
    assert.ok(res.body.checks.env);
    assert.ok(res.body.checks.job_queue);
    assert.ok(Array.isArray(res.body.checks.routes?.mounted));
  });

  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route-xyz');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });
});
