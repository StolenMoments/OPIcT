import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvalPrompt } from '../src/ai/prompts.js';

test('evaluation prompt translates Korean segments in corrected_answer', () => {
  const prompt = buildEvalPrompt('Tell me about your day.', 'I stayed 집에 all day.');

  assert.match(prompt, /Korean.*natural English/i);
  assert.match(prompt, /must not contain Korean/i);
  assert.match(prompt, /Do not mention Korean usage in the feedback fields/i);
  assert.match(prompt, /Base summary_ko, strengths_ko and improvements_ko on the original transcribed answer/i);
  assert.match(prompt, /Use corrected_answer only as a reference for improved English wording, not as the answer being evaluated/i);
});
