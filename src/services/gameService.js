import pool from '../db/pool.js';

export async function getGameSeed(type) {
  const { rows } = await pool.query(
    'SELECT * FROM games WHERE type = $1 AND is_active = true ORDER BY RANDOM() LIMIT 1',
    [type]
  );
  return rows[0] || null;
}

export async function submitScore(userId, gameId, scoreData) {
  const { score, combo = 0, hearts_left = 0, time_taken_seconds = null, metadata = {} } = scoreData;

  await pool.query(
    `INSERT INTO game_scores (user_id, game_id, score, combo, hearts_left, time_taken_seconds, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, gameId, score, combo, hearts_left, time_taken_seconds, JSON.stringify(metadata)]
  );

  const { rows } = await pool.query(
    'SELECT COUNT(*) + 1 AS rank FROM game_scores WHERE game_id = $1 AND score > $2',
    [gameId, score]
  );

  return { saved: true, rank: parseInt(rows[0].rank, 10) };
}
