import pool from '../db/pool.js';
import * as geminiService from './geminiService.js';
import { resetUserEnergyIfStale } from '../utils/energyReset.js';
import { checkStreakUpdate } from '../utils/streak.js';
import { pickExerciseSeed, recordSeedExposure } from './seedSelectionService.js';

const MAX_DAILY_ENERGY = 50;

function normalize(s) {
  return String(s).trim().toLowerCase();
}

export async function getExerciseSeed(userId, type, difficulty = 'medium') {
  const seed = await pickExerciseSeed(userId, type, difficulty);
  if (seed) await recordSeedExposure(userId, 'exercise', seed.id);
  return seed;
}

export async function evaluateAnswer(seedId, userAnswer) {
  const { rows } = await pool.query(
    'SELECT * FROM exercise_seeds WHERE id = $1',
    [seedId]
  );

  if (!rows[0]) {
    const err = new Error('Exercise seed not found');
    err.status = 404;
    throw err;
  }

  const seed = rows[0];
  const { payload } = seed;
  const { answer_key, acceptable_variants = [], explanation, hints = [] } = payload;

  const choiceTypes = ['vocab', 'synonyms', 'antonyms'];
  const stringTypes = [
    'fillup', 'jumbled_word', 'jumbled_sentence',
    'pronunciation_spelling', 'typing_from_audio',
  ];

  let is_correct = false;

  if (choiceTypes.includes(seed.type)) {
    is_correct = String(userAnswer) === String(answer_key);
  } else if (stringTypes.includes(seed.type) || seed.type === 'grammar_transform') {
    const ua = normalize(userAnswer);
    is_correct =
      ua === normalize(answer_key) ||
      acceptable_variants.some((v) => ua === normalize(v));
  }

  const multiplier = { easy: 1, medium: 1.5, hard: 2 }[seed.difficulty] ?? 1;
  const score = Math.round(is_correct ? 100 * multiplier : 0);
  const xp_awarded = Math.max(1, Math.round(score * 0.1));

  return { is_correct, score, xp_awarded, explanation, hints };
}

export async function resetEnergyIfStale(userId) {
  return resetUserEnergyIfStale(userId);
}

export async function checkAndResetEnergy(userId) {
  await resetEnergyIfStale(userId);

  const { rows: [profile] } = await pool.query(
    'SELECT daily_energy_count FROM profiles WHERE user_id = $1',
    [userId]
  );

  if (profile.daily_energy_count >= MAX_DAILY_ENERGY) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    const err = new Error('Daily energy depleted. Resets at midnight UTC.');
    err.code = 'ENERGY_DEPLETED';
    err.status = 402;
    err.resets_at = tomorrow.toISOString();
    throw err;
  }
}

export async function submitExercise(userId, seedId, userAnswer) {
  await checkAndResetEnergy(userId);

  const evaluation = await evaluateAnswer(seedId, userAnswer);
  const { is_correct, score, xp_awarded } = evaluation;

  await pool.query(
    `INSERT INTO exercise_submissions (user_id, seed_id, user_answer, is_correct, score, xp_awarded)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, seedId, JSON.stringify(userAnswer), is_correct, score, xp_awarded]
  );
  await recordSeedExposure(userId, 'exercise', seedId);

  await pool.query(
    'UPDATE profiles SET xp = xp + $1, daily_energy_count = daily_energy_count + 1 WHERE user_id = $2',
    [xp_awarded, userId]
  );

  await checkStreakUpdate(userId);

  const { rows: [updated] } = await pool.query(
    'SELECT xp, streak FROM profiles WHERE user_id = $1',
    [userId]
  );

  return {
    ...evaluation,
    new_total_xp: updated.xp,
    streak_count: updated.streak,
  };
}

export async function evaluateSpeakingExercise(userId, audioId, promptId) {
  // Fetch the speaking prompt seed
  const { rows: seedRows } = await pool.query(
    'SELECT * FROM exercise_seeds WHERE id = $1',
    [promptId]
  );
  if (!seedRows[0]) {
    const err = new Error('Speaking prompt not found');
    err.status = 404;
    throw err;
  }
  const seed = seedRows[0];
  const promptText = seed.payload?.prompt_text || null;

  // Fetch the transcript (requires status = 'done')
  const { rows: audioRows } = await pool.query(
    "SELECT * FROM audio_files WHERE id = $1 AND user_id = $2",
    [audioId, userId]
  );
  if (!audioRows[0]) {
    const err = new Error('Audio file not found');
    err.status = 404;
    throw err;
  }
  if (audioRows[0].status !== 'done') {
    throw new Error('Transcript not ready');
  }

  const { rows: tRows } = await pool.query(
    'SELECT * FROM transcripts WHERE audio_id = $1 ORDER BY created_at DESC LIMIT 1',
    [audioId]
  );
  if (!tRows[0]) {
    throw new Error('Transcript not ready');
  }
  const transcript = tRows[0];

  // Use existing feedback if available, otherwise request analysis
  let feedbackJson = transcript.feedback_json;
  if (!feedbackJson) {
    feedbackJson = await geminiService.analyzeTranscript(
      transcript.raw_text,
      promptText,
      'speaking'
    );
    await pool.query(
      'UPDATE transcripts SET feedback_json = $1 WHERE id = $2',
      [JSON.stringify(feedbackJson), transcript.id]
    );
  }

  // Composite score: average of four dimensions
  const compositeScore = Math.round(
    (feedbackJson.pronunciation.score +
      feedbackJson.vocabulary.score +
      feedbackJson.grammar.score +
      feedbackJson.fluency.score) / 4
  );
  const xpAwarded = Math.round(compositeScore * 0.2);

  await pool.query(
    `INSERT INTO exercise_submissions
       (user_id, seed_id, user_answer, is_correct, score, xp_awarded)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      userId,
      promptId,
      JSON.stringify({ audio_id: audioId }),
      compositeScore >= 60,
      compositeScore,
      xpAwarded,
    ]
  );

  await checkAndResetEnergy(userId);

  await pool.query(
    'UPDATE profiles SET xp = xp + $1, daily_energy_count = daily_energy_count + 1 WHERE user_id = $2',
    [xpAwarded, userId]
  );

  await checkStreakUpdate(userId);

  return { score: compositeScore, xp_awarded: xpAwarded, feedback: feedbackJson };
}

export async function getSpeakingPrompt(userId) {
  const { rows: [profile] } = await pool.query(
    'SELECT xp FROM profiles WHERE user_id = $1',
    [userId]
  );

  const xp = profile?.xp || 0;
  let difficulty;
  if (xp <= 300) difficulty = 'easy';       // A1 / A2
  else if (xp <= 1500) difficulty = 'medium'; // B1 / B2
  else difficulty = 'hard';                  // C1

  for (const diff of [difficulty, 'medium', 'easy']) {
    const seed = await pickExerciseSeed(userId, 'speaking_prompt', diff);
    if (seed) {
      await recordSeedExposure(userId, 'exercise', seed.id);
      return seed;
    }
  }

  return null;
}
