#!/usr/bin/env node
/**
 * Smoke test — covers all major API flows end-to-end.
 * Usage:
 *   BASE_URL=https://...onrender.com/api/v1 \
 *   SMOKE_ADMIN_EMAIL=admin@kikoo.test \
 *   SMOKE_ADMIN_PASSWORD=Admin1234! \
 *   node scripts/smoke-test.js
 */

const BASE_URL    = process.env.BASE_URL           || 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL  || 'admin@kikoo.test';
const ADMIN_PASS  = process.env.SMOKE_ADMIN_PASSWORD || 'Admin1234!';

let passed = 0;
let failed = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────

function randomEmail() {
  return `smoke${Math.random().toString(36).slice(2, 10)}@example.com`;
}

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS  ${label}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ FAIL  ${label} — ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── State shared across steps ──────────────────────────────────────────────────

let accessToken, refreshToken, adminToken;
let testEmail = randomEmail();
let fillupSeedId, audioId, jobId, gameId;

// ── Auth flows ─────────────────────────────────────────────────────────────────

console.log('\n── Auth ──────────────────────────────────────────────────────────────');

await check('POST /auth/signup', async () => {
  const { status, data } = await api('POST', '/auth/signup', {
    email:    testEmail,
    password: 'SmokeTest1234!',
    username: `smoke${Math.random().toString(36).slice(2, 8)}`,
    fullname: 'Smoke Test User',
    role:     'student',
  });
  assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
  accessToken  = data.data.accessToken;
  refreshToken = data.data.refreshToken;
  assert(accessToken,  'Missing accessToken');
  assert(refreshToken, 'Missing refreshToken');
});

await check('POST /auth/login', async () => {
  const { status, data } = await api('POST', '/auth/login', {
    email: testEmail, password: 'SmokeTest1234!',
  });
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  accessToken  = data.data.accessToken;
  refreshToken = data.data.refreshToken;
});

await check('POST /auth/refresh', async () => {
  const { status, data } = await api('POST', '/auth/refresh', { refreshToken });
  assert(status === 200, `Expected 200, got ${status}`);
  accessToken = data.data.accessToken || accessToken;
});

await check('GET /users/me', async () => {
  const { status } = await api('GET', '/users/me', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}`);
});

// ── Exercises ──────────────────────────────────────────────────────────────────

console.log('\n── Exercises ─────────────────────────────────────────────────────────');

let answerKey = 'goes';

await check('GET /exercises/fillup/seed', async () => {
  const { status, data } = await api('GET', '/exercises/fillup/seed?difficulty=easy', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}`);
  fillupSeedId = data.data?.seed?.id;
  assert(fillupSeedId, 'Missing seed id');
});

await check('POST /exercises/fillup/submit', async () => {
  const { status } = await api('POST', '/exercises/fillup/submit', {
    seed_id: fillupSeedId, user_answer: answerKey,
  }, accessToken);
  // 200 success or 402 energy depleted are both acceptable
  assert([200, 402].includes(status), `Expected 200 or 402, got ${status}`);
});

// ── Audio (mock flow) ──────────────────────────────────────────────────────────

console.log('\n── Audio ─────────────────────────────────────────────────────────────');

await check('POST /audio/upload-init', async () => {
  const { status, data } = await api('POST', '/audio/upload-init', {
    filename: 'smoke-test.webm', format: 'webm', context_type: 'speaking',
  }, accessToken);
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  audioId = data.data?.upload_id;
  assert(audioId, 'Missing upload_id');
});

await check('POST /audio/complete (mock — cloudinary verify expected to fail)', async () => {
  const { status, data } = await api('POST', '/audio/complete', {
    upload_id:            audioId,
    cloudinary_public_id: 'kikoo/audio/smoke-test/fake-public-id',
    cloudinary_url:       'https://res.cloudinary.com/demo/video/upload/dog.mp4',
    format:               'webm',
  }, accessToken);
  // 202 = enqueued; 400 = cloudinary verify failed (expected with fake public_id)
  assert([202, 400].includes(status), `Expected 202 or 400, got ${status}`);
  if (status === 202) jobId = data.data?.job_id;
});

await check('GET /jobs (list)', async () => {
  const { status } = await api('GET', '/jobs', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}`);
});

if (jobId) {
  await check(`GET /jobs/:id (${jobId.slice(0, 8)}…)`, async () => {
    const { status } = await api('GET', `/jobs/${jobId}`, null, accessToken);
    assert([200, 404].includes(status), `Expected 200 or 404, got ${status}`);
  });
}

// ── Games ──────────────────────────────────────────────────────────────────────

console.log('\n── Games ─────────────────────────────────────────────────────────────');

await check('GET /games/conexo/seed', async () => {
  const { status, data } = await api('GET', '/games/conexo/seed', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  gameId = data.data?.game?.id;
  assert(gameId, 'Missing game id');
});

await check('POST /games/conexo/score', async () => {
  const { status, data } = await api('POST', '/games/conexo/score', {
    game_id: gameId, score: 1500, combo: 3, hearts_left: 2, time_taken_seconds: 45,
  }, accessToken);
  assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
  assert(typeof data.data?.rank === 'number', 'Missing rank in response');
});

// ── Contests ───────────────────────────────────────────────────────────────────

console.log('\n── Contests ──────────────────────────────────────────────────────────');

await check('GET /contests (list active)', async () => {
  const { status } = await api('GET', '/contests', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}`);
});

// ── Admin ──────────────────────────────────────────────────────────────────────

console.log('\n── Admin ─────────────────────────────────────────────────────────────');

await check('POST /auth/login (admin)', async () => {
  const { status, data } = await api('POST', '/auth/login', {
    email: ADMIN_EMAIL, password: ADMIN_PASS,
  });
  if (status !== 200) {
    throw new Error(`Admin login failed (${status}) — run seed:users first`);
  }
  adminToken = data.data.accessToken;
  assert(adminToken, 'Missing admin accessToken');
});

if (adminToken) {
  await check('GET /admin/users', async () => {
    const { status } = await api('GET', '/admin/users', null, adminToken);
    assert(status === 200, `Expected 200, got ${status}`);
  });

  await check('GET /admin/logs', async () => {
    const { status } = await api('GET', '/admin/logs', null, adminToken);
    assert(status === 200, `Expected 200, got ${status}`);
  });
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

console.log('\n── Cleanup ───────────────────────────────────────────────────────────');

await check('DELETE /users/me', async () => {
  const { status } = await api('DELETE', '/users/me', null, accessToken);
  assert(status === 200, `Expected 200, got ${status}`);
});

// ── Summary ────────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n══════════════════════════════════════════════════════`);
console.log(`  ${passed}/${total} tests passed${failed > 0 ? ` — ${failed} FAILED` : ' ✓'}`);
console.log(`══════════════════════════════════════════════════════\n`);

process.exit(failed > 0 ? 1 : 0);
