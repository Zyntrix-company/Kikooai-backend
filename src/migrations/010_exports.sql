-- exports: tracks admin-triggered CSV/JSON data export jobs
CREATE TABLE IF NOT EXISTS exports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  export_type   TEXT        NOT NULL
                CHECK (export_type IN ('users', 'transcripts', 'contest_results', 'game_scores')),
  file_url      TEXT        DEFAULT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'done', 'failed')),
  error_message TEXT        DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Add 'archived' to the audio_files status CHECK constraint so the retention job can mark files
ALTER TABLE audio_files DROP CONSTRAINT IF EXISTS audio_files_status_check;
ALTER TABLE audio_files ADD CONSTRAINT audio_files_status_check
  CHECK (status IN ('uploaded', 'processing', 'done', 'failed', 'archived'));

CREATE INDEX IF NOT EXISTS idx_exports_requested_by ON exports(requested_by);
CREATE INDEX IF NOT EXISTS idx_exports_status       ON exports(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_status   ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_created  ON audio_files(created_at);
