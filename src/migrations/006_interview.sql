CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- interview_rooms: tracks a user's mock interview session
CREATE TABLE IF NOT EXISTS interview_rooms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_token  TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  settings    JSONB       NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'created'
              CHECK (status IN ('created','recording','processing','done','failed')),
  start_ts    TIMESTAMPTZ DEFAULT NULL,
  end_ts      TIMESTAMPTZ DEFAULT NULL,
  audio_id    UUID        REFERENCES audio_files(id) DEFAULT NULL,
  result_json JSONB       DEFAULT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- job_listings: curated job postings (admin or partner sourced)
CREATE TABLE IF NOT EXISTS job_listings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  company     TEXT        NOT NULL,
  location    TEXT        DEFAULT NULL,
  job_type    TEXT        DEFAULT NULL
              CHECK (job_type IN ('full_time','part_time','contract','internship','remote')),
  description TEXT        NOT NULL,
  url         TEXT        DEFAULT NULL,
  source      TEXT        NOT NULL DEFAULT 'admin'
              CHECK (source IN ('admin','partner')),
  is_active   BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_listings_title_company ON job_listings(title, company);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id            ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_reports_resume_id   ON resume_reports(resume_id);
