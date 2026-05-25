/**
 * Quick Gemini smoke test (uses .env).
 *   node scripts/test-gemini.js
 *   node scripts/test-gemini.js --list-models
 */
import 'dotenv/config';
import {
  getGeminiModelCandidates,
  generateContentWithFallback,
  getGeminiApiKey,
} from '../src/utils/geminiClient.js';

const listOnly = process.argv.includes('--list-models');

async function main() {
  const key = getGeminiApiKey();
  console.log('API key:', `${key.slice(0, 8)}…${key.slice(-4)}`);
  console.log('Model chain:', getGeminiModelCandidates().join(' → '));

  if (listOnly) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    const json = await res.json();
    if (!res.ok) {
      console.error('List models failed:', json);
      process.exit(1);
    }
    const names = (json.models || [])
      .map((m) => m.name?.replace('models/', ''))
      .filter((n) => n?.includes('gemini'));
    console.log('Available gemini models (sample):', names.slice(0, 15).join(', '));
    return;
  }

  const result = await generateContentWithFallback((model) =>
    model.generateContent('Reply with exactly one word: OK')
  );
  const text = result.response.text().trim();
  console.log('Response:', text);
  console.log('Gemini OK');
}

main().catch((err) => {
  console.error('Gemini test FAILED:', err.message);
  process.exit(1);
});
