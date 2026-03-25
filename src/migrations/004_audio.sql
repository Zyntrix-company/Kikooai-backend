-- audio_files: stores metadata for uploaded audio recordings
CREATE TABLE IF NOT EXISTS audio_files (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT       NOT NULL,
  cloudinary_url      TEXT        NOT NULL,
  duration_seconds    INTEGER,
  format              TEXT,
  status              TEXT        NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN ('uploaded','processing','done','failed')),
  context_type        TEXT        NOT NULL DEFAULT 'speaking'
                      CHECK (context_type IN ('speaking','interview','speed_reading')),
  archived_at         TIMESTAMPTZ DEFAULT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- transcripts: stores transcription text and AI feedback for each audio file
CREATE TABLE IF NOT EXISTS transcripts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  audio_id         UUID        NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_text         TEXT        NOT NULL,
  segments         JSONB       DEFAULT '[]',
  asr_confidence   FLOAT       DEFAULT NULL,
  feedback_json    JSONB       DEFAULT NULL,
  schema_version   TEXT        DEFAULT '1.0',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- jobs: tracks background processing jobs (transcription, analysis, etc.)
CREATE TABLE IF NOT EXISTS jobs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type           TEXT        NOT NULL
                 CHECK (type IN ('transcription','resume_analyze','resume_roast','interview_score')),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','done','failed')),
  progress_pct   INTEGER     DEFAULT 0,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_ref    JSONB       NOT NULL DEFAULT '{}',
  error_message  TEXT        DEFAULT NULL,
  attempts       INTEGER     DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);
