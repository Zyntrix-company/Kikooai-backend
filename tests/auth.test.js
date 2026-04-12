import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import {
  BASE, randomEmail, randomUsername,
  createTestUser, deleteTestUser, loginUser, bearer,
} from './helpers.js';

// ─── POST /auth/signup ────────────────────────────────────────────────────────

describe('POST /auth/signup', () => {
  let createdToken;

  after(async () => {
    if (createdToken) await deleteTestUser(createdToken);
  });

  it('returns 201 with accessToken and refreshToken on valid data', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({
        email:    randomEmail(),
        password: 'Valid1234!',
        username: randomUsername(),
        fullname: 'Full Name',
        role:     'student',
      });

    assert.equal(res.status, 201);
    assert.ok(res.body.data.accessToken,  'Missing accessToken');
    assert.ok(res.body.data.refreshToken, 'Missing refreshToken');
    assert.ok(res.body.data.user.id,      'Missing user.id');
    createdToken = res.body.data.accessToken;
  });

  it('returns 400 on invalid email', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({
        email:    'not-an-email',
        password: 'Valid1234!',
        username: randomUsername(),
        fullname: 'Full Name',
        role:     'student',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('returns 400 on non-alphanumeric username', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({
        email:    randomEmail(),
        password: 'Valid1234!',
        username: 'bad user!',
        fullname: 'Full Name',
        role:     'student',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({
        email:    randomEmail(),
        password: 'short',
        username: randomUsername(),
        fullname: 'Full Name',
        role:     'student',
      });

    assert.equal(res.status, 400);
  });

  it('returns 400 on invalid role', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({
        email:    randomEmail(),
        password: 'Valid1234!',
        username: randomUsername(),
        fullname: 'Full Name',
        role:     'hacker',
      });

    assert.equal(res.status, 400);
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({ email: randomEmail() });

    assert.equal(res.status, 400);
  });

  it('returns 409 on duplicate email', async () => {
    const email    = randomEmail();
    const username = randomUsername();

    // First signup
    const first = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({ email, password: 'Valid1234!', username, fullname: 'A', role: 'student' });
    assert.equal(first.status, 201);

    // Second signup with same email
    const second = await request(app)
      .post(`${BASE}/auth/signup`)
      .send({ email, password: 'Valid1234!', username: randomUsername(), fullname: 'B', role: 'student' });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'DUPLICATE_USER');

    // Cleanup
    await deleteTestUser(first.body.data.accessToken);
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: testUser.email, password: testUser.password });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.accessToken);
    assert.ok(res.body.data.refreshToken);
  });

  it('returns 400 on invalid email format', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: 'bad', password: 'Test1234!' });

    assert.equal(res.status, 400);
  });

  it('returns 4xx on wrong password', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: testUser.email, password: 'WrongPass99!' });

    assert.ok(res.status >= 400);
  });

  it('returns 4xx on non-existent email', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: 'nobody@nowhere.test', password: 'Test1234!' });

    assert.ok(res.status >= 400);
  });
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('returns 200 and a new accessToken with valid refreshToken', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: testUser.refreshToken });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.accessToken);
  });

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/refresh`)
      .send({});

    assert.equal(res.status, 400);
  });

  it('returns 401 for a fake refreshToken', async () => {
    const res = await request(app)
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: 'totally-fake-token' });

    assert.equal(res.status, 401);
  });
});

// ─── Auth guard (protected routes) ───────────────────────────────────────────

describe('Auth guard', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get(`${BASE}/users/me`);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_TOKEN');
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get(`${BASE}/users/me`)
      .set('Authorization', 'Bearer garbage.token.here');

    assert.equal(res.status, 401);
  });
});

// ─── GET /users/me ────────────────────────────────────────────────────────────

describe('GET /users/me', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('returns 200 with user object', async () => {
    const res = await request(app)
      .get(`${BASE}/users/me`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, testUser.email);
    assert.ok(res.body.data.user.id);
  });
});

// ─── PATCH /users/me ─────────────────────────────────────────────────────────

describe('PATCH /users/me', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  it('updates profile fields and returns 200', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/me`)
      .set(bearer(testUser.accessToken))
      .send({
        interests: ['coding', 'reading'],
        motive:    'career change',
        education: { degree: 'BSc', field: 'CS' },
      });

    assert.equal(res.status, 200);
    assert.ok(res.body.data.profile);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/me`)
      .send({ motive: 'testing' });

    assert.equal(res.status, 401);
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('returns 200 and clears the session', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post(`${BASE}/auth/logout`)
      .set(bearer(user.accessToken));

    assert.equal(res.status, 200);
    // Token should now be invalidated — refresh should fail
    const refresh = await request(app)
      .post(`${BASE}/auth/refresh`)
      .send({ refreshToken: user.refreshToken });
    assert.equal(refresh.status, 401);
  });
});

// ─── DELETE /users/me ─────────────────────────────────────────────────────────

describe('DELETE /users/me', () => {
  it('returns 200 and removes the account', async () => {
    const user = await createTestUser();

    const del = await request(app)
      .delete(`${BASE}/users/me`)
      .set(bearer(user.accessToken));

    assert.equal(del.status, 200);
    assert.equal(del.body.data.deleted, true);

    // Account should be gone
    const me = await request(app)
      .get(`${BASE}/users/me`)
      .set(bearer(user.accessToken));

    assert.ok([401, 404].includes(me.status), 'Expected 401 or 404 after deletion');
  });
});
