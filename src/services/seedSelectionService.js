import pool from '../db/pool.js';

/**
 * Pick a seed the user has not been shown yet for this type/difficulty.
 * When every seed has been shown, exposures for that slice are cleared and we cycle.
 */
export async function pickExerciseSeed(userId, type, difficulty, excludeIds = []) {
  if (!userId) return queryExerciseSeed(null, type, difficulty, excludeIds);

  let seed = await queryExerciseSeed(userId, type, difficulty, excludeIds, true);
  if (seed) return seed;

  await clearExerciseExposures(userId, type, difficulty);
  seed = await queryExerciseSeed(userId, type, difficulty, excludeIds, true);
  if (seed) return seed;

  return queryExerciseSeed(userId, type, difficulty, excludeIds, false);
}

export async function pickGameSeed(userId, type, excludeIds = []) {
  if (!userId) return queryGameSeed(null, type, excludeIds);

  let game = await queryGameSeed(userId, type, excludeIds, true);
  if (game) return game;

  await clearGameExposures(userId, type);
  game = await queryGameSeed(userId, type, excludeIds, true);
  if (game) return game;

  return queryGameSeed(userId, type, excludeIds, false);
}

/** Record that this seed was shown to the user (call after every successful pick). */
export async function recordSeedExposure(userId, seedKind, seedId) {
  if (!userId || !seedId) return;
  await pool.query(
    `INSERT INTO user_seed_exposures (user_id, seed_kind, seed_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, seed_kind, seed_id) DO NOTHING`,
    [userId, seedKind, seedId]
  );
}

async function clearExerciseExposures(userId, type, difficulty) {
  await pool.query(
    `DELETE FROM user_seed_exposures ue
     USING exercise_seeds es
     WHERE ue.user_id = $1
       AND ue.seed_kind = 'exercise'
       AND ue.seed_id = es.id
       AND es.type = $2
       AND es.difficulty = $3`,
    [userId, type, difficulty]
  );
}

async function clearGameExposures(userId, type) {
  await pool.query(
    `DELETE FROM user_seed_exposures ue
     USING games g
     WHERE ue.user_id = $1
       AND ue.seed_kind = 'game'
       AND ue.seed_id = g.id
       AND g.type = $2`,
    [userId, type]
  );
}

async function queryExerciseSeed(userId, type, difficulty, excludeIds, skipSeen) {
  const params = [type, difficulty];
  const clauses = ['es.type = $1', 'es.difficulty = $2'];

  if (skipSeen && userId) {
    params.push(userId);
    const u = params.length;
    clauses.push(`es.id NOT IN (
      SELECT seed_id FROM user_seed_exposures
      WHERE user_id = $${u} AND seed_kind = 'exercise'
      UNION
      SELECT es2.id FROM exercise_submissions sub
      JOIN exercise_seeds es2 ON es2.id = sub.seed_id
      WHERE sub.user_id = $${u} AND es2.type = $1 AND es2.difficulty = $2
    )`);
  }

  if (excludeIds.length > 0) {
    const start = params.length + 1;
    const placeholders = excludeIds.map((_, i) => `$${start + i}`).join(', ');
    clauses.push(`es.id NOT IN (${placeholders})`);
    params.push(...excludeIds);
  }

  const { rows } = await pool.query(
    `SELECT es.* FROM exercise_seeds es
     WHERE ${clauses.join(' AND ')}
     ORDER BY RANDOM() LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function queryGameSeed(userId, type, excludeIds, skipSeen) {
  const params = [type];
  const clauses = ['g.type = $1', 'g.is_active = true'];

  if (skipSeen && userId) {
    params.push(userId);
    const u = params.length;
    clauses.push(`g.id NOT IN (
      SELECT seed_id FROM user_seed_exposures
      WHERE user_id = $${u} AND seed_kind = 'game'
      UNION
      SELECT gs.game_id FROM game_scores gs
      JOIN games g2 ON g2.id = gs.game_id
      WHERE gs.user_id = $${u} AND g2.type = $1
    )`);
  }

  if (excludeIds.length > 0) {
    const start = params.length + 1;
    const placeholders = excludeIds.map((_, i) => `$${start + i}`).join(', ');
    clauses.push(`g.id NOT IN (${placeholders})`);
    params.push(...excludeIds);
  }

  const { rows } = await pool.query(
    `SELECT g.* FROM games g
     WHERE ${clauses.join(' AND ')}
     ORDER BY RANDOM() LIMIT 1`,
    params
  );
  return rows[0] || null;
}
