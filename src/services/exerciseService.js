import pool from '../db/pool.js';

const MAX_DAILY_ENERGY = 50;

function normalize(s) {
  return String(s).trim().toLowerCase();
}

export async function getExerciseSeed(type, difficulty = 'medium') {
  const { rows } = await pool.query(
    'SELECT * FROM exercise_seeds WHERE type = $1 AND difficulty = $2 ORDER BY RANDOM() LIMIT 1',
    [type, difficulty]
  );
  return rows[0] || null;
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

export async function checkAndResetEnergy(userId) {
  const { rows: [profile] } = await pool.query(
    'SELECT daily_energy_count, energy_reset_date FROM profiles WHERE user_id = $1',
    [userId]
  );

  const today = new Date().toISOString().slice(0, 10);
  const resetDate = String(profile.energy_reset_date).slice(0, 10);

  if (resetDate < today) {
    await pool.query(
      'UPDATE profiles SET daily_energy_count = 0, energy_reset_date = CURRENT_DATE WHERE user_id = $1',
      [userId]
    );
    return; // fresh day — not depleted
  }

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

export async function checkStreakUpdate(userId) {
  const MIN_ENERGY = parseInt(process.env.MIN_DAILY_ENERGY_FOR_STREAK || '10', 10);

  const { rows: [profile] } = await pool.query(
    'SELECT daily_energy_count, streak, last_streak_update, badges FROM profiles WHERE user_id = $1',
    [userId]
  );

  if (profile.daily_energy_count < MIN_ENERGY) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastUpdate = profile.last_streak_update
    ? String(profile.last_streak_update).slice(0, 10)
    : null;

  if (lastUpdate === today) return; // already updated today

  const newStreak = profile.streak + 1;
  const bonusXp = newStreak * 5;

  const milestones = {
    7:   { id: 'streak_7',   name: '7-Day Streak' },
    30:  { id: 'streak_30',  name: '30-Day Streak' },
    100: { id: 'streak_100', name: '100-Day Streak' },
  };

  let badges = profile.badges || [];
  if (milestones[newStreak]) {
    badges = [
      ...badges,
      { ...milestones[newStreak], awarded_at: new Date().toISOString() },
    ];
  }

  await pool.query(
    `UPDATE profiles
     SET streak = $1, last_streak_update = CURRENT_DATE, xp = xp + $2, badges = $3
     WHERE user_id = $4`,
    [newStreak, bonusXp, JSON.stringify(badges), userId]
  );
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

  await pool.query(
    'UPDATE profiles SET xp = xp + $1, daily_energy_count = daily_energy_count + 1 WHERE user_id = $2',
    [xp_awarded, userId]
  );

  await checkStreakUpdate(userId);

  return evaluation;
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

  let { rows } = await pool.query(
    "SELECT * FROM exercise_seeds WHERE type = 'speaking_prompt' AND difficulty = $1 ORDER BY RANDOM() LIMIT 1",
    [difficulty]
  );

  if (!rows[0] && difficulty !== 'medium') {
    const fallback = await pool.query(
      "SELECT * FROM exercise_seeds WHERE type = 'speaking_prompt' AND difficulty = 'medium' ORDER BY RANDOM() LIMIT 1"
    );
    rows = fallback.rows;
  }

  return rows[0] || null;
}
