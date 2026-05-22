import pool from '../db/pool.js';
import { computeWordSimilarity } from './geminiService.js';
import { pickGameSeed, recordSeedExposure } from './seedSelectionService.js';

export async function getGameSeed(userId, type) {
  const game = await pickGameSeed(userId, type);
  if (game) await recordSeedExposure(userId, 'game', game.id);
  return game;
}

export async function submitScore(userId, gameId, scoreData) {
  const { score, combo = 0, hearts_left = 0, time_taken_seconds = null, metadata = {} } = scoreData;

  await pool.query(
    `INSERT INTO game_scores (user_id, game_id, score, combo, hearts_left, time_taken_seconds, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, gameId, score, combo, hearts_left, time_taken_seconds, JSON.stringify(metadata)]
  );
  await recordSeedExposure(userId, 'game', gameId);

  const { rows } = await pool.query(
    'SELECT COUNT(*) + 1 AS rank FROM game_scores WHERE game_id = $1 AND score > $2',
    [gameId, score]
  );

  return { saved: true, rank: parseInt(rows[0].rank, 10) };
}

export async function rankContextoooGuess(seedId, guess) {
  const { rows: [game] } = await pool.query(
    "SELECT seed_json FROM games WHERE id = $1 AND type = 'contextooo' AND is_active = true",
    [seedId]
  );

  if (!game) {
    const err = new Error('Contextooo game not found');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const secretWord = game.seed_json.answer_key;
  if (!secretWord) {
    const err = new Error('Game seed is missing answer_key');
    err.status = 500;
    throw err;
  }

  return computeWordSimilarity(secretWord, guess);
}
