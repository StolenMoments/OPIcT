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
    {
      source_type: 'attempt',
      source_id: 7,
      source_text: 'I go yesterday.',
      created_at: '2026-08-14 00:00:00',
      result: {
        summary_ko: '평가 요약',
        strengths_ko: ['강점'],
        improvements_ko: ['개선점'],
        corrected_answer: 'I went yesterday.',
        correction_notes: [{ before: 'go', after: 'went', reason_ko: '과거형입니다.' }],
        recommended_expressions: [{ text: 'go for a walk', note_ko: '산책하다' }],
      },
    },
    {
      source_type: 'correction',
      source_id: 8,
      source_text: 'I am work since Monday.',
      created_at: '2026-08-14 00:00:01',
      result: {
        corrected: 'I have been working since Monday.',
        alternatives: [{ text: 'I started working on Monday.', note_ko: '시작 시점 강조' }],
        explanation_ko: '현재완료진행형을 사용합니다.',
      },
    },
  ]);

  assert.match(prompt, /correction reasons.*first/i);
  assert.match(prompt, /recommended expressions.*secondary/i);
  assert.match(prompt, /source_type.*source_id/i);
  assert.match(prompt, /Korean intent/i);
  assert.match(prompt, /duplicate/i);
  assert.match(prompt, /correction_notes/);
  assert.match(prompt, /recommended_expressions/);
  assert.match(prompt, /corrected/);
  assert.match(prompt, /alternatives/);
  assert.match(prompt, /explanation_ko/);
  assert.doesNotMatch(prompt, /summary_ko|strengths_ko|improvements_ko|corrected_answer|created_at/);
  assert.match(prompt, /note.*source/i);
  assert.match(prompt, /memo/i);
});

test('material prompt serializes a note source with its memo instead of correction/attempt fields', () => {
  const prompt = buildTrainingMaterialPrompt([
    {
      source_type: 'note',
      source_id: 3,
      source_text: 'I have been saving this sentence.',
      created_at: '2026-08-21 00:00:00',
      result: { text_en: 'I have been saving this sentence.', memo: '현재완료진행형' },
    },
  ]);

  assert.match(prompt, /"source_type":"note"/);
  assert.match(prompt, /현재완료진행형/);
  assert.doesNotMatch(prompt, /"corrected"|alternatives|explanation_ko/);
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
  assert.match(prompt, /구조: /);
  assert.match(prompt, /핵심 표현: /);
  assert.match(prompt, /at most 3 words/i);
  assert.match(prompt, /never quote more than 3 consecutive words/i);
});

test('training schemas reject incomplete material and grading results', () => {
  const badMaterial = parseAndValidateJson(JSON.stringify({ items: [{ source_type: 'attempt' }] }), trainingMaterialSchema);
  const badGrade = parseAndValidateJson(JSON.stringify({ passes: true, areas: {} }), trainingGradeSchema);

  assert.equal(badMaterial.ok, false);
  assert.equal(badGrade.ok, false);
});
