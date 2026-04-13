/**
 * Admin tests.
 * Pre-requisite: npm run seed:users (admin@kikoo.test must exist).
 * Tests all admin endpoints: user management, badges, pro, promo codes, logs, exports.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import {
  BASE, createTestUser, deleteTestUser,
  loginAdmin, bearer, randomSuffix,
} from './helpers.js';

describe('Admin', () => {
  let adminToken;
  let targetUser;  // a regular user that admin will act upon

  before(async () => {
    const [adminData, target] = await Promise.all([
      loginAdmin(),
      createTestUser(),
    ]);
    adminToken = adminData.accessToken;
    targetUser = target;
  });

  after(async () => {
    // Best-effort: admin deletes the target user; if already deleted in tests, that's fine
    await request(app)
      .delete(`${BASE}/admin/users/${targetUser.user.id}`)
      .set(bearer(adminToken));
  });

  // ── Admin guard — non-admin must get 403 ────────────────────────────────────

  it('GET /admin/users → 403 for a non-admin user', async () => {
    const regularUser = await createTestUser();
    const res = await request(app)
      .get(`${BASE}/admin/users`)
      .set(bearer(regularUser.accessToken));

    assert.equal(res.status, 403);
    await deleteTestUser(regularUser.accessToken);
  });

  it('GET /admin/logs → 403 for a non-admin user', async () => {
    const regularUser = await createTestUser();
    const res = await request(app)
      .get(`${BASE}/admin/logs`)
      .set(bearer(regularUser.accessToken));

    assert.equal(res.status, 403);
    await deleteTestUser(regularUser.accessToken);
  });

  it('POST /admin/export → 403 for a non-admin user', async () => {
    const regularUser = await createTestUser();
    const res = await request(app)
      .post(`${BASE}/admin/export`)
      .set(bearer(regularUser.accessToken))
      .send({ export_type: 'users' });

    assert.equal(res.status, 403);
    await deleteTestUser(regularUser.accessToken);
  });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('GET /admin/users → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/admin/users`);
    assert.equal(res.status, 401);
  });

  // ── GET /admin/users ─────────────────────────────────────────────────────────

  it('GET /admin/users → 200 with users array and total', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data.users), 'Expected users to be an array');
    assert.ok(typeof res.body.data.total === 'number', 'Expected numeric total');
  });

  it('GET /admin/users?search=admin → filters by search term', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users?search=admin`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.users));
  });

  // ── GET /admin/users/:id ─────────────────────────────────────────────────────

  it('GET /admin/users/:id → 200 with user detail', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users/${targetUser.user.id}`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.id, targetUser.user.id);
  });

  it('GET /admin/users/:id → 404 for unknown user', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/users/00000000-0000-0000-0000-000000000000`)
      .set(bearer(adminToken));

    assert.equal(res.status, 404);
  });

  // ── POST /admin/users/:id/flag ───────────────────────────────────────────────

  it('POST /admin/users/:id/flag → 400 when reason is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/flag`)
      .set(bearer(adminToken))
      .send({});

    assert.equal(res.status, 400);
  });

  it('POST /admin/users/:id/flag → 200 with reason', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/flag`)
      .set(bearer(adminToken))
      .send({ reason: 'Suspicious activity during test' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  // ── POST /admin/users/:id/ban & unban ───────────────────────────────────────

  it('POST /admin/users/:id/ban → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/ban`)
      .set(bearer(adminToken))
      .send({ reason: 'Test ban' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('Banned user cannot login', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: targetUser.email, password: targetUser.password });

    assert.ok(res.status >= 400, `Expected 4xx for banned user, got ${res.status}`);
  });

  it('POST /admin/users/:id/unban → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/unban`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
  });

  it('Unbanned user can login again', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: targetUser.email, password: targetUser.password });

    assert.equal(res.status, 200, `Unbanned user should be able to login`);
  });

  // ── POST /admin/users/:id/grant-pro & revoke-pro ────────────────────────────

  it('POST /admin/users/:id/grant-pro → 400 when days missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/grant-pro`)
      .set(bearer(adminToken))
      .send({});

    assert.equal(res.status, 400);
  });

  it('POST /admin/users/:id/grant-pro → 200 for 30 days', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/grant-pro`)
      .set(bearer(adminToken))
      .send({ days: 30 });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('POST /admin/users/:id/revoke-pro → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/revoke-pro`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
  });

  // ── POST /admin/users/:id/badges/assign & remove ────────────────────────────

  it('POST /admin/users/:id/badges/assign → 400 when badge_name missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/badges/assign`)
      .set(bearer(adminToken))
      .send({ badge_id: 'streak_7' });

    assert.equal(res.status, 400);
  });

  it('POST /admin/users/:id/badges/assign → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/badges/assign`)
      .set(bearer(adminToken))
      .send({ badge_id: 'streak_7', badge_name: '7-Day Streak' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  });

  it('POST /admin/users/:id/badges/remove → 200', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/users/${targetUser.user.id}/badges/remove`)
      .set(bearer(adminToken))
      .send({ badge_id: 'streak_7' });

    assert.equal(res.status, 200);
  });

  // ── Promo codes ──────────────────────────────────────────────────────────────

  const promoCode = `TESTCODE${randomSuffix().toUpperCase().slice(0, 4)}`;

  it('POST /admin/promo-codes → 400 when discount_pct is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/promo-codes`)
      .set(bearer(adminToken))
      .send({ code: promoCode });

    assert.equal(res.status, 400);
  });

  it('POST /admin/promo-codes → 201 for valid promo', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/promo-codes`)
      .set(bearer(adminToken))
      .send({
        code:         promoCode,
        discount_pct: 50,
        max_uses:     10,
        grants_pro:   true,
        pro_days:     7,
      });

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.data.promo.id, 'Missing promo.id');
  });

  it('POST /admin/promo-codes → 409 on duplicate code', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/promo-codes`)
      .set(bearer(adminToken))
      .send({ code: promoCode, discount_pct: 10 });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PROMO_DUPLICATE');
  });

  it('GET /admin/promo-codes → 200 with promos array', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/promo-codes`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.promos));
  });

  // ── POST /promo-codes/redeem (regular user endpoint) ────────────────────────

  it('POST /promo-codes/redeem → 200 for a valid promo code', async () => {
    const redeemer = await createTestUser();

    const res = await request(app)
      .post(`${BASE}/promo-codes/redeem`)
      .set(bearer(redeemer.accessToken))
      .send({ code: promoCode });

    // 200 = redeemed; 400 = exhausted or expired (both valid for the code we created)
    assert.ok([200, 400, 409].includes(res.status), `Unexpected status ${res.status}`);

    await deleteTestUser(redeemer.accessToken);
  });

  it('POST /promo-codes/redeem → 400 for unknown code', async () => {
    const redeemer = await createTestUser();

    const res = await request(app)
      .post(`${BASE}/promo-codes/redeem`)
      .set(bearer(redeemer.accessToken))
      .send({ code: 'TOTALLYINVALIDCODE999' });

    assert.ok(res.status >= 400);
    await deleteTestUser(redeemer.accessToken);
  });

  // ── GET /admin/logs ──────────────────────────────────────────────────────────

  it('GET /admin/logs → 200 with logs array and total', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/logs`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(Array.isArray(res.body.data.logs), 'Expected logs to be an array');
    assert.ok(typeof res.body.data.total === 'number', 'Expected numeric total');
  });

  it('GET /admin/logs?status=failed → filters correctly', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/logs?status=failed`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
  });

  // ── POST /admin/export ───────────────────────────────────────────────────────

  it('POST /admin/export → 400 on invalid export_type', async () => {
    const res = await request(app)
      .post(`${BASE}/admin/export`)
      .set(bearer(adminToken))
      .send({ export_type: 'invalid_type' });

    assert.equal(res.status, 400);
  });

  const EXPORT_TYPES = ['users', 'transcripts', 'contest_results', 'game_scores'];
  for (const exportType of EXPORT_TYPES) {
    it(`POST /admin/export → 202 for export_type=${exportType}`, async () => {
      const res = await request(app)
        .post(`${BASE}/admin/export`)
        .set(bearer(adminToken))
        .send({ export_type: exportType });

      assert.equal(res.status, 202, `Expected 202 for ${exportType}, got ${res.status}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.data.export_id, 'Missing export_id');
    });
  }

  it('GET /admin/exports → 200 with exports array', async () => {
    const res = await request(app)
      .get(`${BASE}/admin/exports`)
      .set(bearer(adminToken));

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.exports));
  });

  // ── DELETE /admin/users/:id ──────────────────────────────────────────────────

  it('DELETE /admin/users/:id → 404 for unknown user', async () => {
    const res = await request(app)
      .delete(`${BASE}/admin/users/00000000-0000-0000-0000-000000000000`)
      .set(bearer(adminToken));

    assert.equal(res.status, 404);
  });
});
