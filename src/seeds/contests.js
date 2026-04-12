import 'dotenv/config';
import pool from '../db/pool.js';

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL  = 'admin@kikoo.test';

async function seed() {
  const client = await pool.connect();
  try {
    // Resolve admin user
    const { rows: adminRows } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );
    if (!adminRows[0]) {
      throw new Error(`Admin user not found (${ADMIN_EMAIL}). Run seed:users first.`);
    }
    const adminId = adminRows[0].id;

    const contests = [
      {
        title:      'Conexo Weekly Challenge',
        game_type:  'conexo',
        status:     'active',
        start_ts:   new Date().toISOString(),
        end_ts:     new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        prize_info: { prize_type: 'pro', pro_days: 30 },
        settings:   { randomize_seed: false },
      },
      {
        title:      'Word Blitz Grand Prix',
        game_type:  'word_blitz',
        status:     'completed',
        start_ts:   new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        end_ts:     new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        prize_info: { prize_type: 'certificate' },
        settings:   { randomize_seed: true },
      },
    ];

    let inserted = 0;
    for (const c of contests) {
      // Idempotent: skip if title already exists
      const { rows: existing } = await client.query(
        'SELECT id FROM contests WHERE title = $1',
        [c.title]
      );
      if (existing[0]) {
        console.log(`[seed] Contest "${c.title}" already exists — skipping.`);
        continue;
      }

      const { rows } = await client.query(
        `INSERT INTO contests (creator_id, game_type, title, start_ts, end_ts, prize_info, settings, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, token`,
        [
          adminId,
          c.game_type,
          c.title,
          c.start_ts,
          c.end_ts,
          JSON.stringify(c.prize_info),
          JSON.stringify(c.settings),
          c.status,
        ]
      );
      const { id, token } = rows[0];
      const shareLink = `${APP_BASE_URL}/contests/${token}`;
      await client.query('UPDATE contests SET share_link = $1 WHERE id = $2', [shareLink, id]);

      console.log(`[seed] Contest "${c.title}" created — token: ${token}, share_link: ${shareLink}`);
      inserted++;
    }

    console.log(`[seed] Done — inserted ${inserted} contests.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
