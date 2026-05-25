import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import {
  generateContentWithFallback,
  getGeminiApiKey,
  wrapGeminiError,
  isGeminiQuotaError,
  withGeminiRetry,
} from '../utils/geminiClient.js';

const genAI = new GoogleGenerativeAI(getGeminiApiKey());

const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';

function getEmbeddingModel() {
  const modelName = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Transcribe an audio buffer using Gemini.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType  e.g. 'audio/webm'
 * @returns {{ text: string, confidence: number }}
 */
export async function transcribeAudio(audioBuffer, mimeType) {
  const base64Data = audioBuffer.toString('base64');

  // Normalise: Gemini supports video/webm but not audio/webm
  const normalisedMime = mimeType === 'audio/webm' ? 'video/webm' : mimeType;

  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent([
        { inlineData: { mimeType: normalisedMime, data: base64Data } },
        {
          text: 'Transcribe this audio exactly as spoken. Return only the transcribed text with no additional commentary, labels, or formatting.',
        },
      ])
    );

    const text = result.response.text().trim();
    return { text, confidence: 0.85 };
  } catch (err) {
    console.error('[gemini] transcribeAudio error:', err?.message);
    throw wrapGeminiError(err, 'AI transcription failed');
  }
}

const FEEDBACK_SCHEMA = `{
  "pronunciation": { "score": 0-100, "issues": [{ "word": "", "suggestion": "" }] },
  "vocabulary":    { "score": 0-100, "strong_words": [], "weak_words": [], "suggestions": [] },
  "grammar":       { "score": 0-100, "errors": [{ "original": "", "corrected": "", "rule": "" }] },
  "fluency":       { "score": 0-100, "wpm": 0, "pause_count": 0, "notes": "" },
  "filler_words":  { "count": 0, "words": [{ "word": "", "occurrences": 0 }] },
  "suggestions":   [],
  "overall_score": 0-100,
  "level":         "A1|A2|B1|B2|C1|C2",
  "schema_version": "1.0"
}`;

function buildSystemPrompt(contextType) {
  if (contextType === 'speed_reading') {
    return `You are an expert at evaluating spoken English against a reference text.
Analyse the transcript carefully and return ONLY a valid JSON object — no markdown, no backticks, no explanation.`;
  }
  return `You are an expert English language coach specialising in ${contextType === 'interview' ? 'job interview' : 'general spoken'} English proficiency assessment.
Analyse the transcript across pronunciation, vocabulary, grammar, fluency, and filler words.
Return ONLY a valid JSON object — no markdown, no backticks, no explanation.`;
}

/**
 * Analyse a transcript and return structured feedback JSON.
 * @param {string} transcriptText
 * @param {string|null} promptText  The original prompt/question
 * @param {'speaking'|'interview'|'speed_reading'} contextType
 */
export async function analyzeTranscript(transcriptText, promptText, contextType) {
  const systemPrompt = buildSystemPrompt(contextType);
  const userMessage  =
    'Transcript: ' +
    transcriptText +
    (promptText ? '\nOriginal prompt/question: ' + promptText : '') +
    `\n\nReturn ONLY a valid JSON object matching this schema exactly:\n${FEEDBACK_SCHEMA}`;

  const fullPrompt = systemPrompt + '\n\n' + userMessage;

  let rawText;
  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent(fullPrompt)
    );
    rawText = result.response.text().trim();
  } catch (err) {
    throw wrapGeminiError(err, 'AI analysis service failed');
  }

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Retry once with an even more explicit instruction
    try {
      const retry = await generateContentWithFallback((model) =>
        model.generateContent(
          systemPrompt +
            '\n\nReturn ONLY raw JSON with no markdown, no backticks, no explanation:\n' +
            userMessage
        )
      );
      const raw2   = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw2);
    } catch {
      const e  = new Error('AI returned malformed response');
      e.code   = 'AI_PARSE_ERROR';
      e.status = 502;
      throw e;
    }
  }
}

// ─── Semantic Similarity (Contextooo) ────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function computeWordSimilarity(wordA, wordB) {
  const a = String(wordA).trim().toLowerCase();
  const b = String(wordB).trim().toLowerCase();

  if (!a || !b) {
    const err = new Error('Both words are required for similarity ranking');
    err.code = 'INVALID_INPUT';
    err.status = 400;
    throw err;
  }

  if (a === b) {
    return { similarity: 1, rank: 1 };
  }

  const embModel = getEmbeddingModel();
  const embedOpts = { taskType: TaskType.SEMANTIC_SIMILARITY };

  let resA;
  let resB;
  try {
    [resA, resB] = await Promise.all([
      withGeminiRetry(() =>
        embModel.embedContent({ content: { parts: [{ text: a }] }, ...embedOpts })
      ),
      withGeminiRetry(() =>
        embModel.embedContent({ content: { parts: [{ text: b }] }, ...embedOpts })
      ),
    ]);
  } catch (err) {
    console.error('[gemini] computeWordSimilarity embedContent error:', err?.message);
    throw wrapGeminiError(err, 'Failed to rank guess');
  }

  const valuesA = resA?.embedding?.values;
  const valuesB = resB?.embedding?.values;
  if (!valuesA?.length || !valuesB?.length) {
    const e = new Error('Embedding API returned an empty vector');
    e.code = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  const similarity = cosineSimilarity(valuesA, valuesB);
  const rank = similarity >= 0.999 ? 1 : Math.max(2, Math.round((1 - similarity) * 999) + 1);
  return { similarity: Math.round(similarity * 10000) / 10000, rank };
}

// ─── Resume Analysis ──────────────────────────────────────────────────────────

/**
 * Extract plain text from a resume file buffer (PDF/DOCX/TXT) via Gemini.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType  e.g. 'application/pdf'
 * @returns {string}
 */
export async function extractResumeText(fileBuffer, mimeType) {
  const base64Data = fileBuffer.toString('base64');

  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent([
        { inlineData: { mimeType, data: base64Data } },
        {
          text: 'Extract all text content from this resume document exactly as written. Return only the plain text with no additional commentary.',
        },
      ])
    );
    return result.response.text().trim();
  } catch (err) {
    console.error('[gemini] extractResumeText error:', err?.message);
    throw wrapGeminiError(err, 'AI resume text extraction failed');
  }
}

const RESUME_REPORT_SCHEMA = `{
  "strengths": ["string"],
  "ats_issues": [{ "issue": "string", "severity": "high|medium|low", "fix": "string" }],
  "suggested_bullets": [{ "section": "string", "original": "string|null", "improved": "string" }],
  "improvement_steps": [{ "step": "string", "priority": 1 }],
  "keywords_missing": ["string"],
  "keywords_matched": ["string"],
  "score": 0,
  "score_breakdown": { "relevance": 0, "formatting": 0, "impact": 0, "ats_compatibility": 0 },
  "summary": "string",
  "roast_lines": []
}`;

/**
 * Analyse a resume against a job description using Gemini.
 * @param {string} resumeText
 * @param {string} jdText
 * @param {string|null} coverLetter
 * @param {'analyze'|'roast'} analysisType
 */
export async function analyzeResume(resumeText, jdText, coverLetter, analysisType) {
  const coverLetterSection = coverLetter
    ? `Cover Letter: ${coverLetter}`
    : 'Cover Letter (if provided): Not provided';

  let prompt;
  if (analysisType === 'roast') {
    prompt =
      `You are a brutally honest but constructive career coach with a sharp sense of humour.\n` +
      `Analyse the resume against the job description. Return ONLY a valid JSON object with no markdown, no backticks, no explanation.\n` +
      `Fill roast_lines with 3-5 witty, sharp but constructive roast comments about the resume.\n` +
      `Keep strengths, ats_issues, score, improvement_steps accurate — the roast is the tone, not the facts.\n` +
      `Make the summary field humorous but still useful.\n` +
      `JSON schema:\n${RESUME_REPORT_SCHEMA}\n` +
      `Resume: ${resumeText}\n` +
      `Job Description: ${jdText}\n` +
      `${coverLetterSection}`;
  } else {
    prompt =
      `You are an expert ATS resume reviewer and career coach.\n` +
      `Analyze the following resume against the job description provided.\n` +
      `Return ONLY a valid JSON object with no markdown, no backticks, no explanation.\n` +
      `JSON schema:\n${RESUME_REPORT_SCHEMA}\n` +
      `Resume: ${resumeText}\n` +
      `Job Description: ${jdText}\n` +
      `${coverLetterSection}`;
  }

  let rawText;
  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent(prompt)
    );
    rawText = result.response.text().trim();
  } catch (err) {
    console.error('[gemini] analyzeResume generateContent error:', err?.message);
    throw wrapGeminiError(err, 'AI resume analysis failed');
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const head = cleaned.slice(0, 120);
    const tail = cleaned.slice(-120);
    console.error('[gemini] analyzeResume JSON.parse failed; preview head/tail:', head, '|', tail);
    let retryCleaned = '';
    try {
      const retry = await generateContentWithFallback((model) =>
        model.generateContent('Return ONLY raw JSON no markdown:\n' + prompt)
      );
      retryCleaned = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(retryCleaned);
    } catch (err2) {
      const head2 = retryCleaned.slice(0, 120);
      const tail2 = retryCleaned.slice(-120);
      console.error('[gemini] analyzeResume retry JSON.parse failed; preview:', head2, '|', tail2);
      const e  = new Error(
        `AI returned malformed resume analysis response${err2?.message ? `: ${err2.message}` : ''}`
      );
      e.code   = 'AI_PARSE_ERROR';
      e.status = 502;
      throw e;
    }
  }
}

// ─── Interview Feedback ───────────────────────────────────────────────────────

const INTERVIEW_FEEDBACK_SCHEMA = `{
  "relevance_score": 0,
  "communication_score": 0,
  "structure_score": 0,
  "confidence_indicators": ["string"],
  "star_method_used": false,
  "strengths": ["string"],
  "improvements": ["string"],
  "model_answer_outline": "string",
  "overall_score": 0,
  "one_line_verdict": "string"
}`;

/**
 * Evaluate an interview answer using Gemini.
 * @param {string} transcriptText  The candidate's spoken answer
 * @param {string} questionText    The interview question
 * @param {string} jobRole         e.g. 'Backend Developer'
 */
export async function generateInterviewFeedback(transcriptText, questionText, jobRole) {
  const prompt =
    `You are an expert interview coach evaluating a candidate's answer for a ${jobRole} role.\n` +
    `Question: ${questionText}\n` +
    `Candidate's Answer: ${transcriptText}\n` +
    `Return ONLY a valid JSON object with no markdown, no backticks, no explanation.\n` +
    `JSON schema:\n${INTERVIEW_FEEDBACK_SCHEMA}`;

  let rawText;
  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent(prompt)
    );
    rawText = result.response.text().trim();
  } catch (err) {
    throw wrapGeminiError(err, 'AI interview feedback service failed');
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const retry = await generateContentWithFallback((model) =>
        model.generateContent('Return ONLY raw JSON no markdown:\n' + prompt)
      );
      const raw2   = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw2);
    } catch {
      const e  = new Error('AI returned malformed interview feedback response');
      e.code   = 'AI_PARSE_ERROR';
      e.status = 502;
      throw e;
    }
  }
}

// ─── Interview Question Generation ───────────────────────────────────────────

const INTERVIEW_QUESTIONS_SCHEMA = `[
  { "question": "string", "difficulty": "Easy|Medium|Hard", "category": "string" }
]`;

/**
 * Generate role-specific interview questions via Gemini.
 * @param {string} role        e.g. 'Backend Developer'
 * @param {string} round       e.g. 'Technical', 'HR', 'Coding', 'System Design'
 * @param {string} difficulty  'Easy' | 'Medium' | 'Hard'
 * @returns {{ questions: Array<{ question, difficulty, category }> }}
 */
export async function generateInterviewQuestions(role, round, difficulty) {
  const prompt =
    `You are an expert technical recruiter. Generate 12 realistic interview questions for a ${role} candidate.\n` +
    `Round type: ${round}\nDifficulty level: ${difficulty}\n` +
    `Mix question categories relevant to the role and round type.\n` +
    `Return ONLY a valid JSON array — no markdown, no backticks, no explanation.\n` +
    `Schema: ${INTERVIEW_QUESTIONS_SCHEMA}`;

  let rawText;
  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent(prompt)
    );
    rawText = result.response.text().trim();
  } catch (err) {
    throw wrapGeminiError(err, 'AI question generation failed');
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const questions = JSON.parse(cleaned);
    return { questions };
  } catch {
    try {
      const retry = await generateContentWithFallback((model) =>
        model.generateContent('Return ONLY raw JSON array no markdown:\n' + prompt)
      );
      const raw2   = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return { questions: JSON.parse(raw2) };
    } catch {
      const e  = new Error('AI returned malformed questions response');
      e.code   = 'AI_PARSE_ERROR';
      e.status = 502;
      throw e;
    }
  }
}

const COMPARE_SCHEMA = `{
  "accuracy_pct": 0-100,
  "word_error_rate": 0.0-1.0,
  "words_correct": 0,
  "words_total": 0,
  "error_details": [{ "original": "", "spoken": "", "type": "substitution|insertion|deletion" }]
}`;

/**
 * Compare the original text with what was spoken (speed reading game).
 * @param {string} originalText
 * @param {string} transcribedText
 */
export async function compareTexts(originalText, transcribedText) {
  const prompt =
    `Compare the original text with the transcribed text and return ONLY a valid JSON object — no markdown, no backticks, no explanation.\n\nOriginal: ${originalText}\nTranscribed: ${transcribedText}\n\nSchema:\n${COMPARE_SCHEMA}`;

  let rawText;
  try {
    const result = await generateContentWithFallback((model) =>
      model.generateContent(prompt)
    );
    rawText = result.response.text().trim();
  } catch (err) {
    throw wrapGeminiError(err, 'AI comparison service failed');
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const retry = await generateContentWithFallback((model) =>
        model.generateContent('Return ONLY raw JSON no markdown:\n' + prompt)
      );
      const raw2  = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw2);
    } catch {
      const e  = new Error('AI returned malformed response');
      e.code   = 'AI_PARSE_ERROR';
      e.status = 502;
      throw e;
    }
  }
}
