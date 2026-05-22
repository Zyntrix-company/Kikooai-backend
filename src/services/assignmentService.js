import pool from '../db/pool.js';
import { resetEnergyIfStale } from './exerciseService.js';
import { pickExerciseSeed, recordSeedExposure } from './seedSelectionService.js';
import { UTC_TODAY_SQL } from '../utils/utcSql.js';

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
 * Seeds are deduplicated against recent submissions and within the same response.
 */
export async function getDailyAssignment(userId) {
  await resetEnergyIfStale(userId);
  const { rows: [profile] } = await pool.query(
    'SELECT xp, daily_energy_count FROM profiles WHERE user_id = $1',
    [userId]
  );

  const xp     = profile?.xp ?? 0;
  const energy = profile?.daily_energy_count ?? 0;
  const { difficulty, cefr } = levelFromXp(xp);

  const assignments = [];
  const pickedIds = [];

  for (const slot of DAILY_PLAN) {
    for (let i = 0; i < slot.count; i++) {
      let seed = null;

      for (const diff of [difficulty, 'medium', 'easy']) {
        seed = await pickExerciseSeed(userId, slot.type, diff, pickedIds);
        if (seed) break;
      }

      if (!seed) continue;

      await recordSeedExposure(userId, 'exercise', seed.id);
      pickedIds.push(seed.id);

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

  const { rows: [countRow] } = await pool.query(
    `SELECT COUNT(*) AS completed
     FROM exercise_submissions
     WHERE user_id = $1
       AND (submitted_at AT TIME ZONE 'UTC')::date = ${UTC_TODAY_SQL}`,
    [userId]
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
