import 'dotenv/config';
import pool from '../db/pool.js';

const seeds = [
  // ─── conexo ──────────────────────────────────────────────────────────────────
  {
    type: 'conexo',
    difficulty: 'easy',
    config: { group_count: 4, words_per_group: 4 },
    seed_json: {
      groups: [
        { category: 'Fruits', words: ['apple', 'mango', 'grape', 'kiwi'] },
        { category: 'Colors', words: ['red', 'blue', 'green', 'yellow'] },
        { category: 'Animals', words: ['lion', 'tiger', 'bear', 'wolf'] },
        { category: 'Vehicles', words: ['car', 'bus', 'train', 'bike'] },
      ],
      mixed_words: [
        'apple', 'red', 'lion', 'car',
        'mango', 'blue', 'tiger', 'bus',
        'grape', 'green', 'bear', 'train',
        'kiwi', 'yellow', 'wolf', 'bike',
      ],
      answer_key: {
        Fruits: ['apple', 'mango', 'grape', 'kiwi'],
        Colors: ['red', 'blue', 'green', 'yellow'],
        Animals: ['lion', 'tiger', 'bear', 'wolf'],
        Vehicles: ['car', 'bus', 'train', 'bike'],
      },
    },
  },
  {
    type: 'conexo',
    difficulty: 'medium',
    config: { group_count: 4, words_per_group: 4 },
    seed_json: {
      groups: [
        { category: 'Planets', words: ['Mars', 'Venus', 'Saturn', 'Jupiter'] },
        { category: 'Currencies', words: ['dollar', 'euro', 'yen', 'pound'] },
        { category: 'Languages', words: ['French', 'Arabic', 'Hindi', 'Swahili'] },
        { category: 'Oceans', words: ['Pacific', 'Atlantic', 'Indian', 'Arctic'] },
      ],
      mixed_words: [
        'Mars', 'dollar', 'French', 'Pacific',
        'Venus', 'euro', 'Arabic', 'Atlantic',
        'Saturn', 'yen', 'Hindi', 'Indian',
        'Jupiter', 'pound', 'Swahili', 'Arctic',
      ],
      answer_key: {
        Planets: ['Mars', 'Venus', 'Saturn', 'Jupiter'],
        Currencies: ['dollar', 'euro', 'yen', 'pound'],
        Languages: ['French', 'Arabic', 'Hindi', 'Swahili'],
        Oceans: ['Pacific', 'Atlantic', 'Indian', 'Arctic'],
      },
    },
  },

  // ─── speed_reading ───────────────────────────────────────────────────────────
  {
    type: 'speed_reading',
    difficulty: 'easy',
    config: { time_seconds: 60 },
    seed_json: {
      text: 'The Amazon rainforest, often referred to as the lungs of the Earth, produces more than twenty percent of the world\'s oxygen supply. It is home to an extraordinary variety of wildlife, including jaguars, anacondas, and thousands of bird species. The forest spans across nine countries in South America, with the largest portion located in Brazil. Scientists estimate that the Amazon contains approximately ten percent of all species on Earth, many of which have not yet been discovered or studied. Protecting this ecosystem is crucial for maintaining global climate stability and biodiversity for future generations.',
      word_count: 95,
      answer_key: null,
    },
  },
  {
    type: 'speed_reading',
    difficulty: 'medium',
    config: { time_seconds: 90 },
    seed_json: {
      text: 'Artificial intelligence has rapidly transformed numerous industries over the past decade, reshaping how humans interact with technology and each other. Machine learning algorithms now power recommendation engines on streaming platforms, fraud detection systems in banking, and diagnostic tools in healthcare. The rise of large language models has further accelerated this transformation, enabling computers to generate coherent text, write code, and engage in nuanced conversation. However, this technological revolution has also raised significant ethical questions about privacy, employment displacement, and the concentration of power among a small number of technology corporations. Policymakers around the world are grappling with how to regulate these systems in ways that encourage innovation while protecting citizens from potential harms. The coming decade will likely determine whether artificial intelligence becomes a broadly beneficial technology or one that exacerbates existing social and economic inequalities.',
      word_count: 130,
      answer_key: null,
    },
  },

  // ─── contextooo ──────────────────────────────────────────────────────────────
  {
    type: 'contextooo',
    difficulty: 'medium',
    config: {},
    seed_json: {
      secret_word: 'ocean',
      hint: 'Think of depth and vastness covering most of our planet',
      max_guesses: 10,
      answer_key: 'ocean',
    },
  },
  {
    type: 'contextooo',
    difficulty: 'hard',
    config: {},
    seed_json: {
      secret_word: 'eclipse',
      hint: 'A celestial event that ancient civilisations once feared',
      max_guesses: 10,
      answer_key: 'eclipse',
    },
  },

  // ─── word_blitz ───────────────────────────────────────────────────────────────
  {
    type: 'word_blitz',
    difficulty: 'easy',
    config: { time_seconds: 60, lives: 3 },
    seed_json: {
      letters: ['A', 'T', 'E', 'S', 'R', 'P'],
      valid_words: ['apes', 'ares', 'arts', 'ate', 'ear', 'ears', 'eat', 'eats', 'era', 'eras', 'pare', 'pares', 'parse', 'part', 'parts', 'past', 'paste', 'pater', 'pates', 'pats', 'pear', 'pears', 'peat', 'peats', 'pets', 'rape', 'rapes', 'rapt', 'rate', 'rates', 'rats', 'reap', 'reaps', 'rest', 'sap', 'sat', 'set', 'spa', 'spar', 'spare', 'spat', 'spear', 'star', 'stare', 'strap', 'tap', 'tape', 'tapes', 'taps', 'tar', 'tare', 'tares', 'tarp', 'tarps', 'tars', 'taser', 'tea', 'tear', 'tears', 'teas', 'trap', 'traps'],
      time_seconds: 60,
      lives: 3,
      answer_key: ['apes', 'ares', 'arts', 'ate', 'ear', 'ears', 'eat', 'eats', 'era', 'eras', 'pare', 'pares', 'parse', 'part', 'parts', 'past', 'paste', 'pater', 'pates', 'pats', 'pear', 'pears', 'peat', 'peats', 'pets', 'rape', 'rapes', 'rapt', 'rate', 'rates', 'rats', 'reap', 'reaps', 'rest', 'sap', 'sat', 'set', 'spa', 'spar', 'spare', 'spat', 'spear', 'star', 'stare', 'strap', 'tap', 'tape', 'tapes', 'taps', 'tar', 'tare', 'tares', 'tarp', 'tarps', 'tars', 'taser', 'tea', 'tear', 'tears', 'teas', 'trap', 'traps'],
    },
  },
  {
    type: 'word_blitz',
    difficulty: 'hard',
    config: { time_seconds: 60, lives: 3 },
    seed_json: {
      letters: ['C', 'H', 'R', 'O', 'M', 'E'],
      valid_words: ['chore', 'chores', 'chrome', 'come', 'comes', 'core', 'cores', 'echo', 'echos', 'hem', 'her', 'hero', 'hoe', 'hoes', 'home', 'homes', 'hore', 'more', 'mores', 'more', 'ore', 'ores', 'rho', 'roe', 'roes', 'some', 'echo'],
      time_seconds: 60,
      lives: 3,
      answer_key: ['chore', 'chores', 'chrome', 'come', 'comes', 'core', 'cores', 'echo', 'echos', 'hem', 'her', 'hero', 'hoe', 'hoes', 'home', 'homes', 'more', 'mores', 'ore', 'ores', 'roe', 'roes'],
    },
  },

  // ─── conexo (hard) — technology, cooking, animal sounds, capitals ────────────
  {
    type: 'conexo',
    difficulty: 'hard',
    config: { group_count: 4, words_per_group: 4 },
    seed_json: {
      groups: [
        { category: 'Technology',    words: ['browser', 'server', 'kernel', 'cache'] },
        { category: 'Cooking verbs', words: ['sauté', 'braise', 'blanch', 'deglaze'] },
        { category: 'Animal sounds', words: ['neigh', 'bray', 'bleat', 'croak'] },
        { category: 'Capital cities', words: ['Ottawa', 'Canberra', 'Nairobi', 'Lisbon'] },
      ],
      mixed_words: [
        'browser', 'sauté',    'neigh',    'Ottawa',
        'server',  'braise',   'bray',     'Canberra',
        'kernel',  'blanch',   'bleat',    'Nairobi',
        'cache',   'deglaze',  'croak',    'Lisbon',
      ],
      answer_key: {
        Technology:     ['browser', 'server', 'kernel', 'cache'],
        'Cooking verbs': ['sauté', 'braise', 'blanch', 'deglaze'],
        'Animal sounds': ['neigh', 'bray', 'bleat', 'croak'],
        'Capital cities': ['Ottawa', 'Canberra', 'Nairobi', 'Lisbon'],
      },
    },
  },

  // ─── speed_reading (hard) ────────────────────────────────────────────────────
  {
    type: 'speed_reading',
    difficulty: 'hard',
    config: { time_seconds: 120 },
    seed_json: {
      text: 'Quantum computing represents a fundamental departure from classical computing paradigms, exploiting the principles of quantum mechanics to process information in ways that would be impossible for conventional machines. Unlike classical bits, which exist in a binary state of either zero or one, quantum bits — or qubits — can exist in a superposition of both states simultaneously. This property, combined with quantum entanglement and interference, allows quantum computers to solve certain computational problems exponentially faster than any classical system. Research institutions and technology companies have invested billions of dollars in developing practical quantum hardware, with notable milestones achieved in error correction, qubit coherence times, and circuit depth. Despite these advances, fully fault-tolerant quantum computers capable of running complex algorithms at scale remain years away. The most promising near-term applications include drug discovery, materials science, and cryptography — particularly the ability to factor large integers, which underpins widely used public-key encryption schemes. This capability has spurred significant investment in post-quantum cryptographic standards by governments and standards bodies worldwide.',
      word_count: 151,
      answer_key: null,
    },
  },

  // ─── contextooo (easy) ───────────────────────────────────────────────────────
  {
    type: 'contextooo',
    difficulty: 'easy',
    config: {},
    seed_json: {
      secret_word: 'sun',
      hint: 'The nearest star to Earth — source of light and warmth',
      max_guesses: 10,
      answer_key: 'sun',
    },
  },

  // ─── word_blitz (medium) ─────────────────────────────────────────────────────
  {
    type: 'word_blitz',
    difficulty: 'medium',
    config: { time_seconds: 60, lives: 3 },
    seed_json: {
      letters: ['B', 'R', 'E', 'A', 'K', 'S'],
      valid_words: [
        'are', 'ares', 'ark', 'arks', 'arse',
        'ask', 'bake', 'baker', 'bakers', 'bare', 'bares',
        'bark', 'barks', 'bars', 'base', 'baser', 'bask',
        'bear', 'bears', 'brake', 'brakes', 'break', 'breaks',
        'ear', 'ears', 'era', 'eras',
        'rake', 'rakes', 'sake', 'sea', 'sear',
      ],
      time_seconds: 60,
      lives: 3,
      answer_key: [
        'are', 'ares', 'ark', 'arks', 'arse',
        'ask', 'bake', 'baker', 'bakers', 'bare', 'bares',
        'bark', 'barks', 'bars', 'base', 'baser', 'bask',
        'bear', 'bears', 'brake', 'brakes', 'break', 'breaks',
        'ear', 'ears', 'era', 'eras',
        'rake', 'rakes', 'sake', 'sea', 'sear',
      ],
    },
  },

  // ─── guess_the_word ──────────────────────────────────────────────────────────
  {
    type: 'guess_the_word',
    difficulty: 'easy',
    config: {},
    seed_json: {
      word: 'elephant',
      hint: 'Large land animal with a trunk',
      max_guesses: 6,
      letter_count: 8,
      answer_key: 'elephant',
    },
  },
  {
    type: 'guess_the_word',
    difficulty: 'medium',
    config: {},
    seed_json: {
      word: 'labyrinth',
      hint: 'A complex network of paths in which it is easy to get lost',
      max_guesses: 6,
      letter_count: 9,
      answer_key: 'labyrinth',
    },
  },
  {
    type: 'guess_the_word',
    difficulty: 'hard',
    config: {},
    seed_json: {
      word: 'whisper',
      hint: 'To speak very quietly so only those nearby can hear',
      max_guesses: 6,
      letter_count: 7,
      answer_key: 'whisper',
    },
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const s of seeds) {
      await client.query(
        `INSERT INTO games (type, difficulty, config, seed_json) VALUES ($1, $2, $3, $4)`,
        [s.type, s.difficulty, JSON.stringify(s.config), JSON.stringify(s.seed_json)]
      );
      inserted++;
    }
    console.log(`[seed] Inserted ${inserted} game seeds.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
