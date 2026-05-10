-- Allow OAuth users who have no password
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Google OAuth identity columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'email';

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
