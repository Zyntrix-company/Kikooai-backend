import { GoogleGenerativeAI } from '@google/generative-ai';

/** Models that support multimodal (audio) + text on Gemini Developer API. */
const DEFAULT_PRIMARY = 'gemini-2.5-flash';
const DEFAULT_FALLBACKS = 'gemini-1.5-flash,gemini-2.0-flash';

export function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!key?.trim()) {
    const e = new Error('GEMINI_API_KEY is not configured');
    e.code = 'AI_CONFIG_ERROR';
    e.status = 500;
    throw e;
  }
  return key.trim();
}

/** Ordered list: primary first, then fallbacks (deduped). */
export function getGeminiModelCandidates() {
  const primary = (
    process.env.GEMINI_MODEL ||
    process.env.AI_MODEL ||
    DEFAULT_PRIMARY
  ).trim();

  const extra = (process.env.GEMINI_MODEL_FALLBACK || DEFAULT_FALLBACKS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set();
  return [primary, ...extra].filter((name) => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

export function isGeminiQuotaError(err) {
  const msg = (err?.message || String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('free_tier') ||
    msg.includes('limit: 0')
  );
}

/** Parse "Please retry in 33.19s" from Gemini error text. */
export function parseRetryDelayMs(err, attempt = 1) {
  const msg = err?.message || '';
  const m = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  const base = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 4000;
  return Math.min(120_000, base * attempt);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function wrapGeminiError(err, prefix = 'AI request failed') {
  const detail = err?.message || String(err);
  const e = new Error(`${prefix}: ${detail}`);
  e.code = isGeminiQuotaError(err) ? 'GEMINI_QUOTA_EXCEEDED' : 'AI_SERVICE_ERROR';
  e.status = 502;
  return e;
}

/**
 * Retry the same model on transient 429 / quota (honours Retry-After hint in message).
 */
export async function withGeminiRetry(fn, { maxAttempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isGeminiQuotaError(err) || attempt >= maxAttempts) break;
      const delay = parseRetryDelayMs(err, attempt);
      console.warn(`[gemini] rate limited, retry ${attempt}/${maxAttempts} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Run generateContent on primary model, then fallbacks on quota errors.
 * @param {(model: import('@google/generative-ai').GenerativeModel) => Promise<import('@google/generative-ai').GenerateContentResult>} buildRequest
 */
export async function generateContentWithFallback(buildRequest) {
  const genAI = new GoogleGenerativeAI(getGeminiApiKey());
  const models = getGeminiModelCandidates();
  let lastErr;

  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await withGeminiRetry(() => buildRequest(model));
      if (i > 0) {
        console.warn(`[gemini] succeeded with fallback model: ${modelName}`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      console.error(`[gemini] model ${modelName} failed:`, (err?.message || err).slice(0, 300));
      const tryNext = isGeminiQuotaError(err) && i < models.length - 1;
      if (tryNext) {
        console.warn(`[gemini] switching to fallback: ${models[i + 1]}`);
        continue;
      }
      break;
    }
  }

  throw wrapGeminiError(lastErr);
}
