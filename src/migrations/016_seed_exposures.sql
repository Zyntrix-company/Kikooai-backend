-- Tracks every exercise/game seed shown to a user (including fetch-without-submit).
CREATE TABLE user_seed_exposures (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_kind  TEXT NOT NULL CHECK (seed_kind IN ('exercise', 'game')),
  seed_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seed_kind, seed_id)
);

CREATE INDEX idx_seed_exposures_user_kind ON user_seed_exposures (user_id, seed_kind);
