/**
 * Shared test helpers.
 * Pre-requisite: npm run seed:users must have been run so admin@kikoo.test exists.
 */
import request from 'supertest';
import app from '../src/app.js';

export const BASE = '/api/v1';

export function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

export function randomEmail() {
  return `test${randomSuffix()}@kikoo.test`;
}

export function randomUsername() {
  return `usr${randomSuffix()}`;
}

/** Create a new user, return { user, accessToken, refreshToken, email, password } */
export async function createTestUser(overrides = {}) {
  const email    = overrides.email    || randomEmail();
  const username = overrides.username || randomUsername();
  const password = overrides.password || 'Test1234!';

  const res = await request(app)
    .post(`${BASE}/auth/signup`)
    .send({
      email,
      password,
      username,
      fullname: 'Test User',
      role:     'student',
      ...overrides,
    });

  if (res.status !== 201) {
    throw new Error(`createTestUser failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return {
    user:         res.body.data.user,
    accessToken:  res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    email,
    password,
  };
}

/** Delete the test user (cleanup) */
export async function deleteTestUser(accessToken) {
  await request(app)
    .delete(`${BASE}/users/me`)
    .set('Authorization', `Bearer ${accessToken}`);
}

/** Login and return { accessToken, refreshToken } */
export async function loginUser(email, password = 'Test1234!') {
  const res = await request(app)
    .post(`${BASE}/auth/login`)
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`loginUser failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data;
}

/** Login as the seeded admin user */
export async function loginAdmin() {
  return loginUser('admin@kikoo.test', 'Admin1234!');
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}
