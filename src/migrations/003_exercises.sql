CREATE TABLE exercise_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN (
    'fillup', 'jumbled_word', 'jumbled_sentence', 'vocab',
    'synonyms', 'antonyms', 'pronunciation_spelling',
    'grammar_transform', 'typing_from_audio', 'speaking_prompt'
  )),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE exercise_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_id UUID NOT NULL REFERENCES exercise_seeds(id),
  user_answer JSONB NOT NULL,
  is_correct BOOLEAN NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now()
);
