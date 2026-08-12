import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionResultSchema, evaluationResultSchema } from '../src/ai/schemas.js';
import { lenientJson, parseAndValidateJson } from '../src/ai/parse.js';

test('plain json', () => {
  assert.deepEqual(lenientJson('{"a":1}'), { a: 1 });
});
test('json in code fence', () => {
  assert.deepEqual(lenientJson('Here:\n```json\n{"a":1}\n```\ndone'), { a: 1 });
});
test('json with surrounding prose', () => {
  assert.deepEqual(lenientJson('Sure! {"a":{"b":2}} hope it helps'), { a: { b: 2 } });
});
test('no json returns null', () => {
  assert.equal(lenientJson('no json here'), null);
});
test('bare json array is rejected, not treated as a successful parse', () => {
  assert.equal(lenientJson('[1,2,3]'), null);
});

const validEvaluation = {
  summary_ko: '과제를 충실히 수행했습니다.',
  strengths_ko: ['경험을 구체적으로 설명했습니다.'],
  improvements_ko: ['시제를 일관되게 사용하세요.'],
  recommended_expressions: [{ text: 'clear my head', note_ko: '머리를 식히다' }],
  corrected_answer: 'I went to the park yesterday.',
  correction_notes: [
    {
      before: 'go',
      after: 'went',
      reason_ko: 'yesterday가 과거 시점을 나타내므로 go를 과거형 went로 고칩니다.',
    },
  ],
};

const validCorrection = {
  corrected: 'I went to the park yesterday.',
  alternatives: [{ text: 'Yesterday, I went to the park.', note_ko: '자연스러운 어순입니다.' }],
  explanation_ko: '과거의 일을 말하므로 과거 시제를 사용합니다.',
};

test('rejects a syntactically valid result with a malformed recommended_expressions array', () => {
  const candidate = { ...validEvaluation, recommended_expressions: [{ text: 'clear my head' }] };
  const result = parseAndValidateJson(JSON.stringify(candidate), evaluationResultSchema);

  assert.equal(result.ok, false);
  assert.match(result.error, /Schema/);
});

test('rejects a syntactically valid result with malformed nested item types', () => {
  const candidate = { ...validCorrection, alternatives: [{ text: 42, note_ko: '설명' }] };
  const result = parseAndValidateJson(JSON.stringify(candidate), correctionResultSchema);

  assert.equal(result.ok, false);
  assert.match(result.error, /Schema/);
});

test('accepts correction notes for replacements, insertions, deletions, and no changes', () => {
  const result = parseAndValidateJson(JSON.stringify({
    ...validEvaluation,
    correction_notes: [
      { before: 'go', after: 'went', reason_ko: '과거 시제입니다.' },
      { before: '', after: 'really ', reason_ko: '강조 표현을 추가합니다.' },
      { before: 'very ', after: '', reason_ko: '불필요한 수식어를 삭제합니다.' },
    ],
  }), evaluationResultSchema);
  const empty = parseAndValidateJson(JSON.stringify({ ...validEvaluation, correction_notes: [] }), evaluationResultSchema);

  assert.equal(result.ok, true);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.value.correction_notes, []);
});

test('rejects a malformed nested correction note item', () => {
  const result = parseAndValidateJson(JSON.stringify({
    ...validEvaluation,
    correction_notes: [{ before: 'go', after: 42, reason_ko: '설명' }],
  }), evaluationResultSchema);

  assert.equal(result.ok, false);
  assert.match(result.error, /Schema/);
});

test('rejects an extra top-level field', () => {
  const result = parseAndValidateJson(JSON.stringify({ ...validEvaluation, extra: true }), evaluationResultSchema);

  assert.equal(result.ok, false);
  assert.match(result.error, /additionalProperties/);
});

test('accepts complete evaluation and correction results with empty arrays', () => {
  const evaluation = parseAndValidateJson(JSON.stringify({
    ...validEvaluation,
    strengths_ko: [],
    improvements_ko: [],
    recommended_expressions: [],
    correction_notes: [],
  }), evaluationResultSchema);
  const correction = parseAndValidateJson(JSON.stringify({ ...validCorrection, alternatives: [] }), correctionResultSchema);

  assert.deepEqual(evaluation.value, {
    ...validEvaluation,
    strengths_ko: [],
    improvements_ko: [],
    recommended_expressions: [],
    correction_notes: [],
  });
  assert.deepEqual(correction.value, { ...validCorrection, alternatives: [] });
});
