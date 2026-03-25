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
