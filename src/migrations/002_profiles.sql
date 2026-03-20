CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interests TEXT[] DEFAULT '{}',
  education JSONB DEFAULT '{}',
  motive TEXT DEFAULT '',
  targets JSONB DEFAULT '{}',
  resume_ref UUID DEFAULT NULL,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'pro', 'pro_trial')),
  pro_expires_at TIMESTAMPTZ DEFAULT NULL,
  streak INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  daily_energy_count INTEGER DEFAULT 0,
  energy_reset_date DATE DEFAULT CURRENT_DATE,
  badges JSONB DEFAULT '[]',
  last_streak_update DATE DEFAULT NULL
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
