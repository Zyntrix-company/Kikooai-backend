import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

const ROUNDS = 10;

const users = [
  {
    email:    'student@kikoo.test',
    password: 'Student1234!',
    username: 'test_student',
    fullname: 'Alex Student',
    role:     'student',
    is_admin: false,
    profile:  { interests: ['vocabulary', 'grammar'], motive: 'Improve my English for everyday use' },
  },
  {
    email:    'jobseeker@kikoo.test',
    password: 'JobSeeker1234!',
    username: 'test_jobseeker',
    fullname: 'Jordan Job Seeker',
    role:     'job_seeker',
    is_admin: false,
    profile:  { interests: ['resume', 'interview'], motive: 'Land a software engineering role' },
  },
  {
    email:    'pro@kikoo.test',
    password: 'Pro1234!',
    username: 'test_professional',
    fullname: 'Sam Professional',
    role:     'professional',
    is_admin: false,
    profile:  { interests: ['speaking', 'fluency'], motive: 'Maintain business-level English' },
  },
  {
    email:    'admin@kikoo.test',
    password: 'Admin1234!',
    username: 'admin_kikoo',
    fullname: 'Kikoo Admin',
    role:     'student',
    is_admin: true,
    profile:  { interests: [], motive: 'Platform administration' },
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    const results = [];

    for (const u of users) {
      // Idempotent: skip if already exists
      const { rows: existing } = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [u.email]
      );
      if (existing[0]) {
        results.push({ email: u.email, password: u.password, status: 'already exists' });
        continue;
      }

      const password_hash = await bcrypt.hash(u.password, ROUNDS);
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, username, fullname, role, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [u.email, password_hash, u.username, u.fullname, u.role, u.is_admin]
      );
      const userId = rows[0].id;

      await client.query(
        `INSERT INTO profiles (user_id, interests, motive, subscription_status)
         VALUES ($1, $2, $3, 'free')`,
        [userId, u.profile.interests, u.profile.motive]
      );

      inserted++;
      results.push({ email: u.email, password: u.password, status: 'inserted' });
    }

    console.log(`\n[seed] Inserted ${inserted} users.\n`);
    console.log('┌─────────────────────────────┬───────────────────┬──────────────────┐');
    console.log('│ Email                        │ Password          │ Status           │');
    console.log('├─────────────────────────────┼───────────────────┼──────────────────┤');
    for (const r of results) {
      console.log(
        `│ ${r.email.padEnd(28)} │ ${r.password.padEnd(17)} │ ${r.status.padEnd(16)} │`
      );
    }
    console.log('└─────────────────────────────┴───────────────────┴──────────────────┘\n');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
