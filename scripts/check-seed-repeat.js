import 'dotenv/config';
import pool from '../src/db/pool.js';
import { pickExerciseSeed, pickGameSeed, recordSeedExposure } from '../src/services/seedSelectionService.js';

const { rows: [user] } = await pool.query('SELECT id FROM users LIMIT 1');
if (!user) {
  console.log('No users in DB');
  process.exit(0);
}
const uid = user.id;

async function consecutivePicks(label, picker, args, kind, n = 10) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const row = await picker(...args);
    if (row?.id) {
      await recordSeedExposure(uid, kind, row.id);
      ids.push(row.id);
    }
  }
  const unique = new Set(ids).size;
  const repeats = ids.length - unique;
  console.log(`${label}: ${unique}/${ids.length} unique (${repeats} repeats)`);
  return repeats === 0;
}

console.log('User', uid, '\n');

// Clear exposures for clean test
await pool.query('DELETE FROM user_seed_exposures WHERE user_id = $1', [uid]);

const { rows: [fillupCount] } = await pool.query(
  "SELECT COUNT(*)::int AS n FROM exercise_seeds WHERE type = 'fillup' AND difficulty = 'easy'"
);
const { rows: [synCount] } = await pool.query(
  "SELECT COUNT(*)::int AS n FROM exercise_seeds WHERE type = 'synonyms' AND difficulty = 'medium'"
);
const { rows: [conexoCount] } = await pool.query(
  "SELECT COUNT(*)::int AS n FROM games WHERE type = 'conexo' AND is_active = true"
);

await pool.query('DELETE FROM user_seed_exposures WHERE user_id = $1', [uid]);

const ok1 = await consecutivePicks(
  `fillup/easy (pool=${fillupCount.n})`,
  pickExerciseSeed,
  [uid, 'fillup', 'easy'],
  'exercise',
  fillupCount.n
);
const ok2 = await consecutivePicks(
  `synonyms/medium (pool=${synCount.n})`,
  pickExerciseSeed,
  [uid, 'synonyms', 'medium'],
  'exercise',
  synCount.n
);
const ok3 = await consecutivePicks(
  `conexo (pool=${conexoCount.n})`,
  pickGameSeed,
  [uid, 'conexo'],
  'game',
  conexoCount.n
);

console.log('\nExpected: all unique for N picks = pool size. Repeats only after pool cycles.');
console.log(ok1 && ok2 && ok3 ? 'PASS' : 'FAIL');

await pool.end();
