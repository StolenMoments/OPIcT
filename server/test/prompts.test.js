import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvalPrompt } from '../src/ai/prompts.js';

test('evaluation prompt translates Korean segments in corrected_answer', () => {
  const prompt = buildEvalPrompt('Tell me about your day.', 'I stayed 집에 all day.');

  assert.match(prompt, /Korean.*natural English/i);
  assert.match(prompt, /must not contain Korean/i);
});
