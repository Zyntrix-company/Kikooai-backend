import 'dotenv/config';
import pool from '../db/pool.js';

const fillups = [
  {
    type: 'fillup', difficulty: 'easy',
    payload: {
      sentence: 'She ___ to the market every morning.',
      blank_count: 1,
      answer_key: 'goes',
      acceptable_variants: ['go'],
      explanation: "'Goes' is correct because the subject is third-person singular.",
      hints: ['Think about subject-verb agreement.', "The subject is 'She'."],
    },
  },
  {
    type: 'fillup', difficulty: 'medium',
    payload: {
      sentence: 'By the time we arrived, the movie ___ already started.',
      blank_count: 1,
      answer_key: 'had',
      acceptable_variants: [],
      explanation: "Past perfect 'had started' is used for an action completed before another past action.",
      hints: ['Use past perfect tense.', "Look for the word 'already'."],
    },
  },
  {
    type: 'fillup', difficulty: 'hard',
    payload: {
      sentence: 'Neither the manager nor the employees ___ aware of the policy change.',
      blank_count: 1,
      answer_key: 'were',
      acceptable_variants: [],
      explanation: "With 'neither...nor', the verb agrees with the subject closest to it ('employees' = plural).",
      hints: ['Check the subject closest to the verb.', "Neither...nor follows proximity rule."],
    },
  },
];

const jumbledWords = [
  {
    type: 'jumbled_word', difficulty: 'easy',
    payload: {
      letters: ['e', 'x', 'a', 'm', 'p', 'l', 'e'],
      answer_key: 'example',
      explanation: "The word is 'example'.",
      hints: ["Starts with 'e'.", '7 letters.'],
    },
  },
  {
    type: 'jumbled_word', difficulty: 'medium',
    payload: {
      letters: ['a', 'b', 's', 't', 'r', 'a', 'c', 't'],
      answer_key: 'abstract',
      explanation: "The word is 'abstract'.",
      hints: ["Starts with 'a'.", '8 letters.'],
    },
  },
  {
    type: 'jumbled_word', difficulty: 'hard',
    payload: {
      letters: ['p', 'e', 'r', 's', 'e', 'v', 'e', 'r', 'e'],
      answer_key: 'persevere',
      explanation: "The word is 'persevere', meaning to continue despite difficulty.",
      hints: ["Related to persistence.", '9 letters.'],
    },
  },
];

const vocabItems = [
  {
    type: 'vocab', difficulty: 'easy',
    payload: {
      word: 'ephemeral',
      definition_question: "Which best describes 'ephemeral'?",
      options: [
        { id: 'a', text: 'Lasting for a very short time' },
        { id: 'b', text: 'Extremely large' },
        { id: 'c', text: 'Related to water' },
        { id: 'd', text: 'Ancient or historical' },
      ],
      answer_key: 'a',
      explanation: "Ephemeral means lasting for a very short time, from Greek 'ephemeros' (lasting a day).",
      hints: ['Think about flowers that bloom for only one day.'],
    },
  },
  {
    type: 'vocab', difficulty: 'medium',
    payload: {
      word: 'loquacious',
      definition_question: "What does 'loquacious' mean?",
      options: [
        { id: 'a', text: 'Very quiet and reserved' },
        { id: 'b', text: 'Tending to talk a great deal' },
        { id: 'c', text: 'Extremely intelligent' },
        { id: 'd', text: 'Easily frightened' },
      ],
      answer_key: 'b',
      explanation: "Loquacious means talking a lot. From Latin 'loqui' (to speak).",
      hints: ['Think about someone who loves to chat.'],
    },
  },
  {
    type: 'vocab', difficulty: 'hard',
    payload: {
      word: 'perspicacious',
      definition_question: "Which meaning fits 'perspicacious'?",
      options: [
        { id: 'a', text: 'Lacking in intelligence' },
        { id: 'b', text: 'Having a ready insight into things; shrewd' },
        { id: 'c', text: 'Causing great worry' },
        { id: 'd', text: 'Excessively proud' },
      ],
      answer_key: 'b',
      explanation: "Perspicacious means having a keen ability to notice and understand things.",
      hints: ['Related to perception and clarity of thought.'],
    },
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    // Idempotent: clear existing seeds of these types before reinserting
    await client.query(
      "DELETE FROM exercise_seeds WHERE type IN ('fillup', 'jumbled_word', 'vocab')"
    );

    const all = [...fillups, ...jumbledWords, ...vocabItems];
    for (const item of all) {
      await client.query(
        'INSERT INTO exercise_seeds (type, difficulty, payload) VALUES ($1, $2, $3)',
        [item.type, item.difficulty, JSON.stringify(item.payload)]
      );
      console.log(`[seed] Inserted ${item.type} (${item.difficulty})`);
    }

    console.log(`[seed] Done — inserted ${all.length} exercise seeds.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
