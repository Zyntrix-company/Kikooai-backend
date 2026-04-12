CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- contests: admin-created competitions tied to a game type
CREATE TABLE IF NOT EXISTS contests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type   TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  token       TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  share_link  TEXT        DEFAULT NULL,
  start_ts    TIMESTAMPTZ DEFAULT NULL,
  end_ts      TIMESTAMPTZ DEFAULT NULL,
  prize_info  JSONB       NOT NULL DEFAULT '{}',
  settings    JSONB       NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'active', 'completed')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- contest_participants: one row per user per contest
-- game_seed_id is a soft reference to games(id) — FK added once games table is created (migration 007)
CREATE TABLE IF NOT EXISTS contest_participants (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id        UUID        NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_token UUID        NOT NULL DEFAULT gen_random_uuid(),
  score             INTEGER     NOT NULL DEFAULT 0,
  rank              INTEGER     DEFAULT NULL,
  game_seed_id      UUID        DEFAULT NULL,
  joined_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contest_id, user_id)
);

-- admin_actions: audit log for all admin operations (extended in migration 009)
CREATE TABLE IF NOT EXISTS admin_actions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  target_type TEXT        DEFAULT NULL,
  target_id   UUID        DEFAULT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contests_token       ON contests(token);
CREATE INDEX IF NOT EXISTS idx_contests_status      ON contests(status);
CREATE INDEX IF NOT EXISTS idx_participants_contest ON contest_participants(contest_id);
CREATE INDEX IF NOT EXISTS idx_participants_user    ON contest_participants(user_id);
