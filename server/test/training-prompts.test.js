import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAndValidateJson } from '../src/ai/parse.js';
import { trainingGradeSchema, trainingMaterialSchema } from '../src/ai/schemas.js';
import {
  buildTrainingGradePrompt,
  buildTrainingMaterialPrompt,
} from '../src/ai/prompts.js';

test('material prompt prioritizes correction reasons, uses expressions second, and preserves source identity', () => {
  const prompt = buildTrainingMaterialPrompt([
    { source_type: 'attempt', source_id: 7, source_text: 'I go yesterday.', result: { correction_notes: [] } },
  ]);

  assert.match(prompt, /correction reasons.*first/i);
  assert.match(prompt, /recommended expressions.*secondary/i);
  assert.match(prompt, /source_type.*source_id/i);
  assert.match(prompt, /Korean intent/i);
  assert.match(prompt, /duplicate/i);
});

test('grade prompt accepts natural alternatives but requires meaning, grammar, naturalness, and focus', () => {
  const prompt = buildTrainingGradePrompt({
    intent_ko: '나는 어제 학교에 갔다.',
    focus_ko: '과거 시제 went 사용',
    reference_en: 'I went to school yesterday.',
    answer_text: 'Yesterday, I went to school.',
    attempt_no: 1,
  });

  assert.match(prompt, /not require an exact match/i);
  for (const area of ['meaning', 'grammar', 'naturalness', 'focus']) {
    assert.match(prompt, new RegExp(area, 'i'));
  }
  assert.match(prompt, /hint_ko/i);
});

test('training schemas reject incomplete material and grading results', () => {
  const badMaterial = parseAndValidateJson(JSON.stringify({ items: [{ source_type: 'attempt' }] }), trainingMaterialSchema);
  const badGrade = parseAndValidateJson(JSON.stringify({ passes: true, areas: {} }), trainingGradeSchema);

  assert.equal(badMaterial.ok, false);
  assert.equal(badGrade.ok, false);
});
