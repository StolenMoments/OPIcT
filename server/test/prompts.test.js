import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrectionVerificationPrompt, buildEvalPrompt, buildEvalVerificationPrompt } from '../src/ai/prompts.js';

test('evaluation prompt translates Korean segments in corrected_answer', () => {
  const prompt = buildEvalPrompt('Tell me about your day.', 'I stayed 집에 all day.');

  assert.match(prompt, /Korean.*natural English/i);
  assert.match(prompt, /must not contain Korean/i);
  assert.match(prompt, /Do not mention Korean usage in the feedback fields/i);
  assert.match(prompt, /Base summary_ko, strengths_ko and improvements_ko on the original transcribed answer/i);
  assert.match(prompt, /Use corrected_answer only as a reference for improved English wording, not as the answer being evaluated/i);
  assert.match(prompt, /Never use the words "Korean", "한국어", or "한국어 문장" in summary_ko, strengths_ko, improvements_ko/i);
  assert.match(prompt, /describe the needed English expression or grammar correction directly/i);
});

test('verification prompts include the original context, candidate JSON, and output contract', () => {
  const correction = buildCorrectionVerificationPrompt('I go yesterday.', { corrected: 'I went yesterday.' });
  const evaluation = buildEvalVerificationPrompt('Tell me about your day.', 'I go yesterday.', { summary_ko: '초안' });

  assert.match(correction, /Validate and, if needed, correct the candidate result below/i);
  assert.match(correction, /Sentence: I go yesterday\./);
  assert.match(correction, /"corrected":"I went yesterday\."/);
  assert.match(evaluation, /Validate and, if needed, correct the candidate result below/i);
  assert.match(evaluation, /Question: Tell me about your day\./);
  assert.match(evaluation, /Transcribed answer: I go yesterday\./);
  assert.match(evaluation, /"summary_ko":"초안"/);
});
