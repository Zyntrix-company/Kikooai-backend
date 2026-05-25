import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGeminiQuotaError,
  parseRetryDelayMs,
  getGeminiModelCandidates,
} from '../src/utils/geminiClient.js';

describe('geminiClient helpers', () => {
  it('detects quota / 429 errors', () => {
    const msg =
      '[429 Too Many Requests] free_tier_input_token_count, limit: 0, model: gemini-2.0-flash';
    assert.equal(isGeminiQuotaError(new Error(msg)), true);
  });

  it('parses retry delay from Gemini message', () => {
    const err = new Error('Please retry in 33.199661072s.');
    assert.ok(parseRetryDelayMs(err) >= 33_000);
  });

  it('builds deduped model chain from env', () => {
    const prev = process.env.GEMINI_MODEL;
    const prevFb = process.env.GEMINI_MODEL_FALLBACK;
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.GEMINI_MODEL_FALLBACK = 'gemini-1.5-flash,gemini-2.5-flash';
    try {
      const chain = getGeminiModelCandidates();
      assert.deepEqual(chain, ['gemini-2.5-flash', 'gemini-1.5-flash']);
    } finally {
      if (prev === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = prev;
      if (prevFb === undefined) delete process.env.GEMINI_MODEL_FALLBACK;
      else process.env.GEMINI_MODEL_FALLBACK = prevFb;
    }
  });
});
