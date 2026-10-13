import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');

test('trip AI uses Gemma first and falls back to Llama JSON mode', () => {
  assert.match(src, /const AI_MODEL = '@cf\/google\/gemma-4-26b-a4b-it';/);
  assert.match(src, /const AI_FALLBACK_MODEL = '@cf\/meta\/llama-3\.3-70b-instruct-fp8-fast';/);
  // Gemma has no JSON mode, so its call carries no response_format; the fallback keeps it.
  assert.match(src, /env\.AI\.run\(AI_MODEL, \{ messages, max_tokens: 5000 \}\)/);
  const fallback = src.slice(src.indexOf('env.AI.run(AI_FALLBACK_MODEL'));
  assert.match(fallback.slice(0, 300), /response_format: \{ type: 'json_object' \}/);
});
