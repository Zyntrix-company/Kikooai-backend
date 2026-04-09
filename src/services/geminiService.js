import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.AI_API_KEY
);

function getModel() {
  const modelName = process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-1.5-flash';
  return genAI.getGenerativeModel({ model: modelName });
}

/**
 * Transcribe an audio buffer using Gemini.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType  e.g. 'audio/webm'
 * @returns {{ text: string, confidence: number }}
 */
export async function transcribeAudio(audioBuffer, mimeType) {
  const model      = getModel();
  const base64Data = audioBuffer.toString('base64');

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64Data } },
      { text: 'Transcribe this audio exactly as spoken. Return only the transcribed text with no additional commentary, labels, or formatting.' },
    ]);

    const text = result.response.text().trim();
    return { text, confidence: 0.85 };
  } catch (err) {
    const e  = new Error('AI transcription service failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
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
  const model      = getModel();
  const systemPrompt = buildSystemPrompt(contextType);
  const userMessage  =
    'Transcript: ' +
    transcriptText +
    (promptText ? '\nOriginal prompt/question: ' + promptText : '') +
    `\n\nReturn ONLY a valid JSON object matching this schema exactly:\n${FEEDBACK_SCHEMA}`;

  const fullPrompt = systemPrompt + '\n\n' + userMessage;

  let rawText;
  try {
    const result = await model.generateContent(fullPrompt);
    rawText = result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI analysis service failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  // Strip markdown code fences if present
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Retry once with an even more explicit instruction
    try {
      const retry  = await model.generateContent(
        systemPrompt +
        '\n\nReturn ONLY raw JSON with no markdown, no backticks, no explanation:\n' +
        userMessage
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

// ─── Resume Analysis ──────────────────────────────────────────────────────────

/**
 * Extract plain text from a resume file buffer (PDF/DOCX/TXT) via Gemini.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType  e.g. 'application/pdf'
 * @returns {string}
 */
export async function extractResumeText(fileBuffer, mimeType) {
  const model      = getModel();
  const base64Data = fileBuffer.toString('base64');

  try {
    const result = await model.generateContent([
      { inlineData: { mimeType, data: base64Data } },
      { text: 'Extract all text content from this resume document exactly as written. Return only the plain text with no additional commentary.' },
    ]);
    return result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI resume text extraction failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
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
  const model = getModel();

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
    const result = await model.generateContent(prompt);
    rawText = result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI resume analysis service failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const retry  = await model.generateContent('Return ONLY raw JSON no markdown:\n' + prompt);
      const raw2   = retry.response.text().trim()
        .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      return JSON.parse(raw2);
    } catch {
      const e  = new Error('AI returned malformed resume analysis response');
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
  const model  = getModel();
  const prompt =
    `You are an expert interview coach evaluating a candidate's answer for a ${jobRole} role.\n` +
    `Question: ${questionText}\n` +
    `Candidate's Answer: ${transcriptText}\n` +
    `Return ONLY a valid JSON object with no markdown, no backticks, no explanation.\n` +
    `JSON schema:\n${INTERVIEW_FEEDBACK_SCHEMA}`;

  let rawText;
  try {
    const result = await model.generateContent(prompt);
    rawText = result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI interview feedback service failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const retry  = await model.generateContent('Return ONLY raw JSON no markdown:\n' + prompt);
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
  const model  = getModel();
  const prompt =
    `You are an expert technical recruiter. Generate 12 realistic interview questions for a ${role} candidate.\n` +
    `Round type: ${round}\nDifficulty level: ${difficulty}\n` +
    `Mix question categories relevant to the role and round type.\n` +
    `Return ONLY a valid JSON array — no markdown, no backticks, no explanation.\n` +
    `Schema: ${INTERVIEW_QUESTIONS_SCHEMA}`;

  let rawText;
  try {
    const result = await model.generateContent(prompt);
    rawText = result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI question generation failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const questions = JSON.parse(cleaned);
    return { questions };
  } catch {
    try {
      const retry  = await model.generateContent('Return ONLY raw JSON array no markdown:\n' + prompt);
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
  const model  = getModel();
  const prompt =
    `Compare the original text with the transcribed text and return ONLY a valid JSON object — no markdown, no backticks, no explanation.\n\nOriginal: ${originalText}\nTranscribed: ${transcribedText}\n\nSchema:\n${COMPARE_SCHEMA}`;

  let rawText;
  try {
    const result = await model.generateContent(prompt);
    rawText = result.response.text().trim();
  } catch (err) {
    const e  = new Error('AI comparison service failed');
    e.code   = 'AI_SERVICE_ERROR';
    e.status = 502;
    throw e;
  }

  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      const retry = await model.generateContent(
        'Return ONLY raw JSON no markdown:\n' + prompt
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
