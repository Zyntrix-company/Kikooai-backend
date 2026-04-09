import 'dotenv/config';
import pool from './pool.js';

const seeds = [
  // ─── fillup ──────────────────────────────────────────────────────────────────
  {
    type: 'fillup', difficulty: 'easy',
    payload: {
      sentence: 'She _____ to school every day.',
      answer_key: 'goes',
      acceptable_variants: ['walks'],
      options: ['go', 'goes', 'going', 'went'],
      explanation: '"Goes" is the correct third-person singular present tense.',
      hints: ['Think about subject-verb agreement.'],
    },
  },
  {
    type: 'fillup', difficulty: 'medium',
    payload: {
      sentence: 'By the time he arrived, we _____ already left.',
      answer_key: 'had',
      acceptable_variants: [],
      options: ['have', 'had', 'has', 'were'],
      explanation: 'Past perfect "had" shows an action completed before another past action.',
      hints: ['Which tense shows an earlier past action?'],
    },
  },
  {
    type: 'fillup', difficulty: 'hard',
    payload: {
      sentence: 'The committee _____ unable to reach a consensus despite numerous deliberations.',
      answer_key: 'was',
      acceptable_variants: [],
      options: ['were', 'was', 'are', 'have been'],
      explanation: '"Committee" is a collective noun treated as singular in formal English.',
      hints: ['Collective nouns take singular verbs.'],
    },
  },

  // ─── jumbled_word ────────────────────────────────────────────────────────────
  {
    type: 'jumbled_word', difficulty: 'easy',
    payload: {
      jumbled: 'pealp',
      answer_key: 'apple',
      acceptable_variants: [],
      explanation: 'Rearrange the letters to form the fruit.',
      hints: ['It is a common red or green fruit.'],
    },
  },
  {
    type: 'jumbled_word', difficulty: 'medium',
    payload: {
      jumbled: 'tceyonmo',
      answer_key: 'economy',
      acceptable_variants: [],
      explanation: 'Rearrange the letters.',
      hints: ['Related to finance and trade.'],
    },
  },
  {
    type: 'jumbled_word', difficulty: 'hard',
    payload: {
      jumbled: 'ctniifginas',
      answer_key: 'significant',
      acceptable_variants: [],
      explanation: 'Rearrange the letters.',
      hints: ['Means important or notable.'],
    },
  },

  // ─── jumbled_sentence ────────────────────────────────────────────────────────
  {
    type: 'jumbled_sentence', difficulty: 'easy',
    payload: {
      words: ['cat', 'The', 'on', 'sat', 'the', 'mat'],
      answer_key: 'The cat sat on the mat',
      acceptable_variants: [],
      explanation: 'Standard subject-verb-prepositional phrase order.',
      hints: ['Start with "The cat".'],
    },
  },
  {
    type: 'jumbled_sentence', difficulty: 'medium',
    payload: {
      words: ['quickly', 'she', 'finished', 'assignment', 'her'],
      answer_key: 'she finished her assignment quickly',
      acceptable_variants: ['she quickly finished her assignment'],
      explanation: 'Adverbs of manner can appear after the object or before the verb.',
      hints: ['Who performs the action?'],
    },
  },
  {
    type: 'jumbled_sentence', difficulty: 'hard',
    payload: {
      words: ['government', 'the', 'implemented', 'swiftly', 'policy', 'new', 'the'],
      answer_key: 'the government swiftly implemented the new policy',
      acceptable_variants: ['the government implemented the new policy swiftly'],
      explanation: 'Formal register: subject-adverb-verb-object-adjective-noun.',
      hints: ['Start with "the government".'],
    },
  },

  // ─── vocab ───────────────────────────────────────────────────────────────────
  {
    type: 'vocab', difficulty: 'easy',
    payload: {
      word: 'happy',
      question: 'What does "happy" mean?',
      options: ['Sad', 'Joyful', 'Angry', 'Tired'],
      answer_key: 'Joyful',
      explanation: '"Happy" means feeling pleasure or contentment.',
      hints: ['It is a positive emotion.'],
    },
  },
  {
    type: 'vocab', difficulty: 'medium',
    payload: {
      word: 'ambiguous',
      question: 'What does "ambiguous" mean?',
      options: ['Clear', 'Open to multiple interpretations', 'Obvious', 'Certain'],
      answer_key: 'Open to multiple interpretations',
      explanation: 'Ambiguous describes something that can be understood in more than one way.',
      hints: ['Think about having two meanings.'],
    },
  },
  {
    type: 'vocab', difficulty: 'hard',
    payload: {
      word: 'sycophant',
      question: 'What does "sycophant" mean?',
      options: ['A harsh critic', 'A person who uses flattery to gain favour', 'An independent thinker', 'A skilled negotiator'],
      answer_key: 'A person who uses flattery to gain favour',
      explanation: 'A sycophant is a servile flatterer.',
      hints: ['Think of excessive praise for personal gain.'],
    },
  },

  // ─── synonyms ────────────────────────────────────────────────────────────────
  {
    type: 'synonyms', difficulty: 'easy',
    payload: {
      word: 'big',
      question: 'Choose the synonym of "big".',
      options: ['Small', 'Large', 'Thin', 'Quick'],
      answer_key: 'Large',
      explanation: '"Large" is a synonym of "big".',
      hints: ['Think of something of great size.'],
    },
  },
  {
    type: 'synonyms', difficulty: 'medium',
    payload: {
      word: 'eloquent',
      question: 'Choose the synonym of "eloquent".',
      options: ['Clumsy', 'Articulate', 'Silent', 'Confused'],
      answer_key: 'Articulate',
      explanation: 'Both "eloquent" and "articulate" describe clear, expressive speech.',
      hints: ['Think of a great public speaker.'],
    },
  },
  {
    type: 'synonyms', difficulty: 'hard',
    payload: {
      word: 'ephemeral',
      question: 'Choose the synonym of "ephemeral".',
      options: ['Eternal', 'Transient', 'Robust', 'Permanent'],
      answer_key: 'Transient',
      explanation: 'Both "ephemeral" and "transient" mean lasting for a very short time.',
      hints: ['Think of something fleeting like morning dew.'],
    },
  },

  // ─── antonyms ────────────────────────────────────────────────────────────────
  {
    type: 'antonyms', difficulty: 'easy',
    payload: {
      word: 'hot',
      question: 'Choose the antonym of "hot".',
      options: ['Warm', 'Cold', 'Spicy', 'Bright'],
      answer_key: 'Cold',
      explanation: '"Cold" is the opposite of "hot".',
      hints: ['Think of ice.'],
    },
  },
  {
    type: 'antonyms', difficulty: 'medium',
    payload: {
      word: 'benevolent',
      question: 'Choose the antonym of "benevolent".',
      options: ['Generous', 'Malevolent', 'Kind', 'Caring'],
      answer_key: 'Malevolent',
      explanation: '"Malevolent" (wishing harm) is the opposite of "benevolent" (wishing good).',
      hints: ['Think of a villain.'],
    },
  },
  {
    type: 'antonyms', difficulty: 'hard',
    payload: {
      word: 'loquacious',
      question: 'Choose the antonym of "loquacious".',
      options: ['Verbose', 'Taciturn', 'Garrulous', 'Voluble'],
      answer_key: 'Taciturn',
      explanation: '"Loquacious" means very talkative; "taciturn" means habitually silent.',
      hints: ['Think of someone who rarely speaks.'],
    },
  },

  // ─── pronunciation_spelling ──────────────────────────────────────────────────
  {
    type: 'pronunciation_spelling', difficulty: 'easy',
    payload: {
      prompt: 'Type the correct spelling of the word pronounced: /ˈkæt/',
      answer_key: 'cat',
      acceptable_variants: [],
      explanation: 'The word is spelled "cat".',
      hints: ['Three letters.'],
    },
  },
  {
    type: 'pronunciation_spelling', difficulty: 'medium',
    payload: {
      prompt: 'Type the correct spelling of the word pronounced: /ˌɪntəˈrʌpʃən/',
      answer_key: 'interruption',
      acceptable_variants: [],
      explanation: 'The word is "interruption" — note the double "r" and "-tion" suffix.',
      hints: ['It means a break or pause in continuity.'],
    },
  },
  {
    type: 'pronunciation_spelling', difficulty: 'hard',
    payload: {
      prompt: 'Type the correct spelling of the word pronounced: /ˌɛpɪˈstɛmɒlədʒi/',
      answer_key: 'epistemology',
      acceptable_variants: [],
      explanation: 'Epistemology is the branch of philosophy concerned with knowledge.',
      hints: ['Greek roots: episteme (knowledge) + logos (study).'],
    },
  },

  // ─── grammar_transform ───────────────────────────────────────────────────────
  {
    type: 'grammar_transform', difficulty: 'easy',
    payload: {
      instruction: 'Rewrite in past tense: "She plays football."',
      answer_key: 'She played football.',
      acceptable_variants: ['she played football'],
      explanation: 'Simple past of "plays" is "played".',
      hints: ['Add -ed to the verb.'],
    },
  },
  {
    type: 'grammar_transform', difficulty: 'medium',
    payload: {
      instruction: 'Convert to passive voice: "The chef cooked the meal."',
      answer_key: 'The meal was cooked by the chef.',
      acceptable_variants: ['the meal was cooked by the chef'],
      explanation: 'Passive: object + was/were + past participle + by + subject.',
      hints: ['Start with "The meal".'],
    },
  },
  {
    type: 'grammar_transform', difficulty: 'hard',
    payload: {
      instruction: 'Convert to reported speech: He said, "I will finish the report by tomorrow."',
      answer_key: 'He said that he would finish the report by the next day.',
      acceptable_variants: ['he said that he would finish the report by the next day'],
      explanation: 'In reported speech, "will" becomes "would" and "tomorrow" becomes "the next day".',
      hints: ['Backshift tense and change time expressions.'],
    },
  },

  // ─── typing_from_audio ───────────────────────────────────────────────────────
  {
    type: 'typing_from_audio', difficulty: 'easy',
    payload: {
      audio_text: 'The sun rises in the east.',
      answer_key: 'The sun rises in the east.',
      acceptable_variants: ['the sun rises in the east'],
      explanation: 'Type exactly what you hear.',
      hints: ['Listen carefully to each word.'],
    },
  },
  {
    type: 'typing_from_audio', difficulty: 'medium',
    payload: {
      audio_text: 'Perseverance is the key to achieving long-term goals.',
      answer_key: 'Perseverance is the key to achieving long-term goals.',
      acceptable_variants: ['perseverance is the key to achieving long-term goals'],
      explanation: 'Type exactly what you hear.',
      hints: ['Focus on the multi-syllable words.'],
    },
  },
  {
    type: 'typing_from_audio', difficulty: 'hard',
    payload: {
      audio_text: 'The juxtaposition of contrasting elements creates a compelling narrative tension.',
      answer_key: 'The juxtaposition of contrasting elements creates a compelling narrative tension.',
      acceptable_variants: ['the juxtaposition of contrasting elements creates a compelling narrative tension'],
      explanation: 'Type exactly what you hear, including punctuation.',
      hints: ['Break the sentence into smaller chunks.'],
    },
  },

  // ─── speaking_prompt ─────────────────────────────────────────────────────────
  {
    type: 'speaking_prompt', difficulty: 'easy',
    payload: {
      prompt_text: 'Describe your daily morning routine in 3-4 sentences.',
      topic: 'Daily life',
      explanation: 'Speak clearly about what you do after waking up.',
      hints: ['Use present simple tense.'],
    },
  },
  {
    type: 'speaking_prompt', difficulty: 'easy',
    payload: {
      prompt_text: 'Talk about your favourite food and why you like it.',
      topic: 'Food & preferences',
      explanation: 'Describe the food and your reasons for liking it.',
      hints: ['Use adjectives to describe the food.'],
    },
  },
  {
    type: 'speaking_prompt', difficulty: 'medium',
    payload: {
      prompt_text: 'Describe a challenge you faced recently and how you overcame it.',
      topic: 'Personal experience',
      explanation: 'Use past tense and describe the situation, challenge, and solution.',
      hints: ['Structure: situation → problem → solution.'],
    },
  },
  {
    type: 'speaking_prompt', difficulty: 'medium',
    payload: {
      prompt_text: 'Compare the advantages and disadvantages of working from home.',
      topic: 'Work & lifestyle',
      explanation: 'Present both sides with examples.',
      hints: ['Use linking words like "however" and "on the other hand".'],
    },
  },
  {
    type: 'speaking_prompt', difficulty: 'hard',
    payload: {
      prompt_text: 'Discuss whether social media has had a net positive or negative impact on society. Justify your position.',
      topic: 'Society & technology',
      explanation: 'Present a reasoned argument with evidence and a clear stance.',
      hints: ['State your thesis first, then support it with 2-3 points.'],
    },
  },
  {
    type: 'speaking_prompt', difficulty: 'hard',
    payload: {
      prompt_text: 'Analyse how globalisation has transformed economic inequalities over the past three decades.',
      topic: 'Global economics',
      explanation: 'Use formal register, cite trends, and present a nuanced view.',
      hints: ['Consider both developed and developing nations.'],
    },
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const s of seeds) {
      await client.query(
        `INSERT INTO exercise_seeds (type, difficulty, payload) VALUES ($1, $2, $3)`,
        [s.type, s.difficulty, JSON.stringify(s.payload)]
      );
      inserted++;
    }
    console.log(`[seed] Inserted ${inserted} exercise seeds.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
