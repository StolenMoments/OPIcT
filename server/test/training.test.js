import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

const TRAINING_STUB = fileURLToPath(new URL('./fixtures/stub-cli-training.js', import.meta.url));
const FAIL_STUB = fileURLToPath(new URL('./fixtures/stub-cli-fail.js', import.meta.url));
process.env.OPICT_CLI_STUB = TRAINING_STUB;

async function waitFor(app, url, statuses, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const response = await app.inject({ url });
    const body = response.json();
    if (statuses.includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timeout waiting for ${statuses.join(', ')}`);
}

function seedSources(app) {
  const category = app.repos.categories.create({ type: 'survey', name: '일상', sort_order: 0 });
  const question = app.repos.questions.create({ category_id: category.id, text: 'Tell me about yesterday.', note: null });
  const attempt = app.repos.attempts.create({
    question_id: question.id,
    input_mode: 'text',
    transcript: 'I go to the park yesterday.',
    status: 'done',
    cli: 'claude',
    model: 'claude-sonnet-5',
  });
  app.repos.attempts.setStatus(attempt.id, {
    status: 'done',
    result_json: JSON.stringify({
      summary_ko: '시제를 고쳐야 합니다.',
      strengths_ko: [],
      improvements_ko: ['과거 시제를 사용하세요.'],
      recommended_expressions: [{ text: 'yesterday afternoon', note_ko: '어제 오후' }],
      corrected_answer: 'I went to the park yesterday.',
      correction_notes: [{ before: 'go', after: 'went', reason_ko: '어제 일은 과거형을 사용합니다.' }],
    }),
  });
  const correction = app.repos.corrections.create({
    input_text: 'I am jogging since two years.',
    cli: 'claude',
    model: 'claude-sonnet-5',
  });
  app.repos.corrections.setStatus(correction.id, {
    status: 'done',
    result_json: JSON.stringify({
      corrected: 'I have been jogging for two years.',
      alternatives: [{ text: 'I started jogging two years ago.', note_ko: '시작 시점 강조' }],
      explanation_ko: '계속되는 기간에는 현재완료진행형이 자연스럽습니다.',
    }),
  });
}

async function prepareApp(t, options = {}) {
  const app = await buildApp({ dbFile: ':memory:', ...options });
  t.after(() => app.close());
  await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { default_cli: 'claude', default_model_claude: 'claude-sonnet-5' },
  });
  seedSources(app);
  return app;
}

async function createReadySession(app) {
  const created = await app.inject({ method: 'POST', url: '/api/training/sessions' });
  assert.equal(created.statusCode, 202);
  return waitFor(app, `/api/training/sessions/${created.json().id}`, ['ready', 'empty', 'error']);
}

test('session material includes evaluation and correction sources, removes duplicates, and hides references', async (t) => {
  const app = await prepareApp(t);
  const session = await createReadySession(app);

  assert.equal(session.status, 'ready');
  assert.deepEqual(session.items.map((item) => item.source_type).sort(), ['attempt', 'correction']);
  assert.equal(session.items.length, 2);
  assert.equal(session.items.every((item) => !Object.hasOwn(item, 'reference_en')), true);
  assert.equal(session.items.every((item) => item.intent_ko && item.focus_ko), true);
});

test('first failure reveals only a Korean hint; rewrite reveals the comparison and completes', async (t) => {
  const app = await prepareApp(t);
  const session = await createReadySession(app);
  const item = session.items.find((candidate) => candidate.source_type === 'attempt');

  const first = await app.inject({
    method: 'POST',
    url: `/api/training/items/${item.id}/answers`,
    payload: { answer_text: 'I go to the park yesterday.' },
  });
  assert.equal(first.statusCode, 202);
  const firstAnswer = await waitFor(app, `/api/training/answers/${first.json().id}`, ['done', 'error']);
  assert.equal(firstAnswer.verdict.passes, false);
  assert.match(firstAnswer.verdict.hint_ko, /과거형/);
  assert.equal(Object.hasOwn(firstAnswer, 'reference_en'), false);

  const afterFirst = (await app.inject({ url: `/api/training/sessions/${session.id}` })).json();
  const awaiting = afterFirst.items.find((candidate) => candidate.id === item.id);
  assert.equal(awaiting.status, 'awaiting_revision');
  assert.equal(Object.hasOwn(awaiting, 'reference_en'), false);

  const second = await app.inject({
    method: 'POST',
    url: `/api/training/items/${item.id}/answers`,
    payload: { answer_text: 'Yesterday, I went to the park.' },
  });
  const secondAnswer = await waitFor(app, `/api/training/answers/${second.json().id}`, ['done', 'error']);
  assert.equal(secondAnswer.verdict.passes, true);
  assert.equal(secondAnswer.reference_en, 'I went to the park yesterday.');

  const duplicate = await app.inject({
    method: 'POST',
    url: `/api/training/items/${item.id}/answers`,
    payload: { answer_text: 'one more' },
  });
  assert.equal(duplicate.statusCode, 409);
});

test('answers must follow session item order', async (t) => {
  const app = await prepareApp(t);
  const session = await createReadySession(app);
  assert.equal(session.items.length, 2);

  const skipped = await app.inject({
    method: 'POST',
    url: `/api/training/items/${session.items[1].id}/answers`,
    payload: { answer_text: 'I have been jogging for two years.' },
  });

  assert.equal(skipped.statusCode, 409);
  assert.equal(skipped.json().code, 'INVALID_TRAINING_TRANSITION');
});

test('two first-try passes across due sessions transition the sentence to mastered', async (t) => {
  let now = new Date('2026-08-12T03:00:00.000Z');
  const app = await prepareApp(t, { now: () => now });
  const firstSession = await createReadySession(app);
  const firstItem = firstSession.items.find((candidate) => candidate.source_type === 'attempt');
  const first = await app.inject({ method: 'POST', url: `/api/training/items/${firstItem.id}/answers`, payload: { answer_text: 'I went to the park yesterday.' } });
  await waitFor(app, `/api/training/answers/${first.json().id}`, ['done']);

  // Complete the other item so the session no longer blocks creation.
  const other = firstSession.items.find((candidate) => candidate.id !== firstItem.id);
  const otherAnswer = await app.inject({ method: 'POST', url: `/api/training/items/${other.id}/answers`, payload: { answer_text: 'I have been jogging for two years.' } });
  await waitFor(app, `/api/training/answers/${otherAnswer.json().id}`, ['done']);

  now = new Date('2026-08-15T03:00:00.000Z');
  const secondSession = await createReadySession(app);
  const due = secondSession.items.find((candidate) => candidate.sentence_id === firstItem.sentence_id);
  const second = await app.inject({ method: 'POST', url: `/api/training/items/${due.id}/answers`, payload: { answer_text: 'Yesterday, I went to the park.' } });
  await waitFor(app, `/api/training/answers/${second.json().id}`, ['done']);

  const sentence = app.repos.training.getSentence(firstItem.sentence_id);
  assert.equal(sentence.mastery_status, 'mastered');
  assert.equal(sentence.first_pass_streak, 2);
  assert.equal(sentence.next_review_on, '2026-08-29');
});

test('failed grading preserves the answer and can be retried without resubmission', async (t) => {
  const app = await prepareApp(t);
  const session = await createReadySession(app);
  const item = session.items[0];
  process.env.OPICT_CLI_STUB = FAIL_STUB;
  try {
    const submitted = await app.inject({ method: 'POST', url: `/api/training/items/${item.id}/answers`, payload: { answer_text: 'I went to the park yesterday.' } });
    const failed = await waitFor(app, `/api/training/answers/${submitted.json().id}`, ['error']);
    assert.equal(failed.answer_text, 'I went to the park yesterday.');

    process.env.OPICT_CLI_STUB = TRAINING_STUB;
    const retried = await app.inject({ method: 'POST', url: `/api/training/answers/${failed.id}/retry` });
    assert.equal(retried.statusCode, 202);
    const completed = await waitFor(app, `/api/training/answers/${failed.id}`, ['done']);
    assert.equal(completed.answer_text, 'I went to the park yesterday.');
  } finally {
    process.env.OPICT_CLI_STUB = TRAINING_STUB;
  }
});

test('generated sentence keeps its source snapshot when the original record result changes', async (t) => {
  const app = await prepareApp(t);
  const session = await createReadySession(app);
  const item = session.items.find((candidate) => candidate.source_type === 'correction');
  const before = app.repos.training.getSentence(item.sentence_id).source_snapshot_json;

  app.repos.corrections.setStatus(item.source_id, {
    status: 'done',
    result_json: JSON.stringify({
      corrected: 'A replacement result from a later retry.',
      alternatives: [],
      explanation_ko: '재시도 결과',
    }),
  });

  assert.equal(app.repos.training.getSentence(item.sentence_id).source_snapshot_json, before);
  assert.match(before, /I have been jogging for two years/);
});

test('session creation requires configured defaults and training routes are authenticated', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const missing = await app.inject({ method: 'POST', url: '/api/training/sessions' });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().code, 'TRAINING_SETTINGS_REQUIRED');

  const auth = {
    passwordHash: hashPassword('correct-password'),
    sessionSecret: 'training-test-secret',
  };
  const protectedApp = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => protectedApp.close());
  const protectedResponse = await protectedApp.inject({ url: '/api/training/sessions/1' });
  assert.equal(protectedResponse.statusCode, 401);
});
