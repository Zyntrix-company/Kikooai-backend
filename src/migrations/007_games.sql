CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'conexo', 'speed_reading', 'contextooo', 'word_blitz', 'guess_the_word'
  )),
  seed_json JSONB NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(id),
  score INTEGER NOT NULL,
  combo INTEGER NOT NULL DEFAULT 0,
  hearts_left INTEGER NOT NULL DEFAULT 0,
  time_taken_seconds INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
