/**
 * Games tests.
 * Pre-requisite: npm run seed:games must have been run.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { BASE, createTestUser, deleteTestUser, bearer } from './helpers.js';

const VALID_TYPES   = ['conexo', 'speed_reading', 'word_blitz', 'guess_the_word', 'contextooo'];

describe('Games', () => {
  let testUser;

  before(async () => { testUser = await createTestUser(); });
  after(async ()  => { await deleteTestUser(testUser.accessToken); });

  // ── Auth guard ──────────────────────────────────────────────────────────────

  it('GET /games/conexo/seed → 401 without token', async () => {
    const res = await request(app).get(`${BASE}/games/conexo/seed`);
    assert.equal(res.status, 401);
  });

  it('POST /games/conexo/score → 401 without token', async () => {
    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .send({ game_id: '00000000-0000-0000-0000-000000000000', score: 100 });
    assert.equal(res.status, 401);
  });

  // ── Type validation ─────────────────────────────────────────────────────────

  it('GET /games/unknown_type/seed → 400 INVALID_TYPE', async () => {
    const res = await request(app)
      .get(`${BASE}/games/unknown_type/seed`)
      .set(bearer(testUser.accessToken));

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_TYPE');
  });

  it('POST /games/unknown_type/score → 400 INVALID_TYPE', async () => {
    const res = await request(app)
      .post(`${BASE}/games/unknown_type/score`)
      .set(bearer(testUser.accessToken))
      .send({ game_id: '00000000-0000-0000-0000-000000000000', score: 100 });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_TYPE');
  });

  // ── Score schema validation ─────────────────────────────────────────────────

  it('POST /games/conexo/score → 400 when game_id missing', async () => {
    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({ score: 100 });

    assert.equal(res.status, 400);
  });

  it('POST /games/conexo/score → 400 when score missing', async () => {
    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({ game_id: '00000000-0000-0000-0000-000000000000' });

    assert.equal(res.status, 400);
  });

  it('POST /games/conexo/score → 400 when game_id is not a UUID', async () => {
    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({ game_id: 'not-a-uuid', score: 100 });

    assert.equal(res.status, 400);
  });

  // ── Seed + score happy path ─────────────────────────────────────────────────

  for (const type of VALID_TYPES) {
    it(`GET /games/${type}/seed → 200 or 404, answer_key stripped`, async () => {
      const res = await request(app)
        .get(`${BASE}/games/${type}/seed`)
        .set(bearer(testUser.accessToken));

      assert.ok([200, 404].includes(res.status), `Unexpected status ${res.status} for type ${type}`);

      if (res.status === 200) {
        const game = res.body.data.game;
        assert.ok(game.id,        'Missing game.id');
        assert.ok(game.type,      'Missing game.type');
        assert.ok(game.seed_json, 'Missing game.seed_json');
        assert.ok(!('answer_key' in game.seed_json), 'answer_key must not be exposed to client');
      }
    });
  }

  it('POST /games/conexo/score → 200 with rank using a real seed game_id', async () => {
    const seedRes = await request(app)
      .get(`${BASE}/games/conexo/seed`)
      .set(bearer(testUser.accessToken));

    if (seedRes.status === 404) {
      // No seeds in DB — skip
      return;
    }
    assert.equal(seedRes.status, 200);
    const gameId = seedRes.body.data.game.id;

    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({
        game_id:            gameId,
        score:              1500,
        combo:              3,
        hearts_left:        2,
        time_taken_seconds: 45,
      });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(typeof res.body.data.rank === 'number', 'Missing numeric rank in response');
  });

  it('Duplicate score submission for same game_id is accepted', async () => {
    const seedRes = await request(app)
      .get(`${BASE}/games/conexo/seed`)
      .set(bearer(testUser.accessToken));

    if (seedRes.status === 404) return;

    const gameId = seedRes.body.data.game.id;

    // First submission
    await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({ game_id: gameId, score: 1000 });

    // Second submission — should update or insert without error
    const res = await request(app)
      .post(`${BASE}/games/conexo/score`)
      .set(bearer(testUser.accessToken))
      .send({ game_id: gameId, score: 2000 });

    assert.equal(res.status, 200);
  });

  it('POST /games/contextooo/rank → 200 with rank and similarity', async () => {
    const seedRes = await request(app)
      .get(`${BASE}/games/contextooo/seed`)
      .set(bearer(testUser.accessToken));

    if (seedRes.status === 404) return;

    assert.equal(seedRes.status, 200);
    const seedId = seedRes.body.data.game.id;

    const res = await request(app)
      .post(`${BASE}/games/contextooo/rank`)
      .set(bearer(testUser.accessToken))
      .send({ seedId, guess: 'beverage' });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(typeof res.body.data.rank === 'number', 'Missing rank');
    assert.ok(typeof res.body.data.similarity === 'number', 'Missing similarity');
    assert.ok(res.body.data.rank >= 1 && res.body.data.rank <= 1000);
  });
});
