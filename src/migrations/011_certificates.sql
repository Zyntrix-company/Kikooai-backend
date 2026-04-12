ALTER TABLE contest_participants
  ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT NULL;
