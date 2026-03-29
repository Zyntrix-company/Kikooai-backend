-- resumes: stores resume metadata (JSON blob or Cloudinary file)
CREATE TABLE IF NOT EXISTS resumes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL DEFAULT 'My Resume',
  json_blob            JSONB       DEFAULT NULL,
  cloudinary_public_id TEXT        DEFAULT NULL,
  cloudinary_url       TEXT        DEFAULT NULL,
  file_format          TEXT        DEFAULT NULL,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- resume_reports: analysis/roast results for a resume + job description pair
CREATE TABLE IF NOT EXISTS resume_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id     UUID        NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  job_id        UUID        NOT NULL REFERENCES jobs(id),
  jd_text       TEXT        NOT NULL,
  cover_letter  TEXT        DEFAULT NULL,
  analysis_type TEXT        NOT NULL CHECK (analysis_type IN ('analyze','roast')),
  report_json   JSONB       DEFAULT NULL,
  score         INTEGER     DEFAULT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','failed')),
  created_at    TIMESTAMPTZ DEFAULT now()
);
