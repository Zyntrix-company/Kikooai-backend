import pool from '../db/pool.js';

// XP thresholds → difficulty + CEFR label
function levelFromXp(xp) {
  if (xp <= 300)  return { difficulty: 'easy',   cefr: 'A1/A2' };
  if (xp <= 1500) return { difficulty: 'medium',  cefr: 'B1/B2' };
  return           { difficulty: 'hard',   cefr: 'C1/C2' };
}

// Types included in the daily plan and how many of each
const DAILY_PLAN = [
  { type: 'fillup',                  count: 1 },
  { type: 'jumbled_sentence',        count: 1 },
  { type: 'vocab',                   count: 1 },
  { type: 'synonyms',                count: 1 },
  { type: 'grammar_transform',       count: 1 },
  { type: 'speaking_prompt',         count: 1 },
];

/**
 * Build and return the user's daily assignment set based on their XP level.
 *
 * Strategy:
 *  - Determine difficulty from XP.
 *  - For each slot in DAILY_PLAN, pick a random seed of that type + difficulty.
 *  - Fall back to 'medium' if no seed found at the target difficulty.
 *  - Strip answer_key/acceptable_variants before returning (same as /exercises/:type/seed).
 *  - Count today's exercise_submissions to show progress.
 */
export async function getDailyAssignment(userId) {
  // 1. Fetch user level
  const { rows: [profile] } = await pool.query(
    'SELECT xp, daily_energy_count FROM profiles WHERE user_id = $1',
    [userId]
  );

  const xp     = profile?.xp ?? 0;
  const energy = profile?.daily_energy_count ?? 0;
  const { difficulty, cefr } = levelFromXp(xp);

  // 2. Fetch seeds for each slot
  const assignments = [];

  for (const slot of DAILY_PLAN) {
    for (let i = 0; i < slot.count; i++) {
      // Try target difficulty first, fall back to medium
      let seed = null;

      for (const diff of [difficulty, 'medium', 'easy']) {
        const { rows } = await pool.query(
          'SELECT * FROM exercise_seeds WHERE type = $1 AND difficulty = $2 ORDER BY RANDOM() LIMIT 1',
          [slot.type, diff]
        );
        if (rows[0]) { seed = rows[0]; break; }
      }

      if (!seed) continue; // type has no seeds at all — skip

      // Strip answer from payload
      const { answer_key, acceptable_variants, ...safePayload } = seed.payload;

      assignments.push({
        type: slot.type,
        seed: {
          id:         seed.id,
          type:       seed.type,
          difficulty: seed.difficulty,
          payload:    safePayload,
        },
      });
    }
  }

  // 3. Count completions today
  const today = new Date().toISOString().slice(0, 10);
  const { rows: [countRow] } = await pool.query(
    `SELECT COUNT(*) AS completed
     FROM exercise_submissions
     WHERE user_id = $1 AND DATE(submitted_at) = $2`,
    [userId, today]
  );
  const completedToday = parseInt(countRow?.completed ?? 0, 10);

  return {
    level: {
      xp,
      cefr,
      difficulty,
      daily_energy_used: energy,
    },
    assignments,
    progress: {
      completed_today: completedToday,
      total:           assignments.length,
    },
  };
}
