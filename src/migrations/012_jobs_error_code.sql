-- Persist stable error codes on failed jobs (for API / support tooling).
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS error_code TEXT DEFAULT NULL;
