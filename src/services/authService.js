import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import pool from '../db/pool.js';
import { sanitizeUser } from '../utils/sanitize.js';

function parseDuration(str) {
  const unit = str.slice(-1);
  const val = parseInt(str.slice(0, -1), 10);
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (map[unit] ?? 86400000);
}

export async function createUser({ email, password, username, fullname, role }) {
  const password_hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [user] } = await client.query(
      `INSERT INTO users (email, password_hash, username, fullname, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, password_hash, username, fullname, role]
    );
    await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    await client.query('COMMIT');
    return sanitizeUser(user);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function loginUser({ email, password }) {
  const { rows: [user] } = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const err = new Error('Invalid credentials');
    err.code = 'INVALID_CREDENTIALS';
    err.status = 401;
    throw err;
  }

  if (user.is_banned) {
    const err = new Error('Account suspended');
    err.code = 'ACCOUNT_BANNED';
    err.status = 403;
    throw err;
  }

  await pool.query('UPDATE users SET last_active = NOW() WHERE id = $1', [user.id]);
  return sanitizeUser(user);
}

export async function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, is_admin: user.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '15m' }
  );

  const refreshToken = randomUUID();
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(
    Date.now() + parseDuration(process.env.REFRESH_TOKEN_EXPIRY || '30d')
  );

  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(incomingToken) {
  const { rows } = await pool.query(
    'SELECT * FROM refresh_tokens WHERE expires_at > NOW()'
  );

  let matched = null;
  for (const row of rows) {
    const ok = await bcrypt.compare(incomingToken, row.token_hash);
    if (ok) { matched = row; break; }
  }

  if (!matched) {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH_TOKEN';
    err.status = 401;
    throw err;
  }

  await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [matched.id]);

  const { rows: [user] } = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [matched.user_id]
  );

  const tokens = await generateTokens(sanitizeUser(user));
  return { ...tokens, user: sanitizeUser(user) };
}

export async function logoutUser(userId) {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function getUserById(id) {
  const { rows: [row] } = await pool.query(
    `SELECT u.id, u.email, u.username, u.fullname, u.role, u.is_banned, u.is_flagged,
            u.is_admin, u.created_at, u.last_active,
            p.interests, p.education, p.motive, p.targets, p.resume_ref,
            p.subscription_status, p.pro_expires_at, p.streak, p.xp,
            p.daily_energy_count, p.energy_reset_date, p.badges, p.last_streak_update
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [id]
  );
  return sanitizeUser(row);
}

export async function updateUserProfile(id, fields) {
  const allowed = ['interests', 'education', 'motive', 'targets', 'resume_ref'];
  const updates = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = $${idx}`);
      values.push(fields[key]);
      idx++;
    }
  }

  if (updates.length === 0) {
    const { rows: [profile] } = await pool.query(
      'SELECT * FROM profiles WHERE user_id = $1', [id]
    );
    return profile;
  }

  values.push(id);
  const { rows: [profile] } = await pool.query(
    `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = $${idx} RETURNING *`,
    values
  );
  return profile;
}
