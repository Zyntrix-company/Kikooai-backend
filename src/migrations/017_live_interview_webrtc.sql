-- Live interview WebRTC metadata.
ALTER TABLE interview_rooms
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS provider_room_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS transcript_json JSONB DEFAULT NULL;

ALTER TABLE interview_rooms
  DROP CONSTRAINT IF EXISTS interview_rooms_status_check;

ALTER TABLE interview_rooms
  ADD CONSTRAINT interview_rooms_status_check
  CHECK (status IN ('created','recording','live','processing','done','failed'));

ALTER TABLE interview_rooms
  DROP CONSTRAINT IF EXISTS interview_rooms_provider_check;

ALTER TABLE interview_rooms
  ADD CONSTRAINT interview_rooms_provider_check
  CHECK (provider IN ('legacy','livekit'));

ALTER TABLE interview_rooms
  DROP CONSTRAINT IF EXISTS interview_rooms_agent_status_check;

ALTER TABLE interview_rooms
  ADD CONSTRAINT interview_rooms_agent_status_check
  CHECK (agent_status IS NULL OR agent_status IN ('pending','joined','failed','completed'));

CREATE INDEX IF NOT EXISTS idx_interview_rooms_provider_room_name
  ON interview_rooms(provider_room_name);

CREATE INDEX IF NOT EXISTS idx_interview_rooms_agent_status
  ON interview_rooms(agent_status);
