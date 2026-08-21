import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

async function prepareApp(t) {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  return app;
}

function insertSentence(app, overrides = {}) {
  app.repos.training.insertSentence({
    source_type: 'correction',
    source_id: overrides.source_id ?? Math.floor(Math.random() * 1_000_000),
    source_snapshot_json: JSON.stringify({ source_type: 'correction', source_id: 1, source_text: 't', result: {} }),
    source_sentence: overrides.source_sentence ?? 'Source sentence.',
    intent_ko: overrides.intent_ko ?? '의도',
    reference_en: overrides.reference_en ?? 'Reference sentence.',
    focus_ko: overrides.focus_ko ?? '초점',
    fingerprint: overrides.fingerprint,
  });
  return app.repos.training.listSentences().find((s) => s.fingerprint === overrides.fingerprint);
}

function markCompletedSessionItem(app, sentenceId) {
  const session = app.repos.training.createSession({ cli: 'claude', model: 'claude-sonnet-5' });
  app.repos.training.addSessionItems(session.id, [{ id: sentenceId }]);
  const item = app.repos.training.listSessionItems(session.id)[0];
  app.repos.training.setSessionStatus(session.id, { status: 'ready' });
  const answer = app.repos.training.createAnswer(item.id, 'draft', 1);
  app.repos.training.completeAnswer(
    answer.id,
    JSON.stringify({ passes: true, areas: {}, hint_ko: '' }),
    null,
    'first_try_pass',
    { mastery_status: 'learning', first_pass_streak: 1, next_review_on: '2026-08-30' },
  );
  return item;
}

test('drill eligibility requires a completed session item, not just session_count', async (t) => {
  const app = await prepareApp(t);
  const eligible = insertSentence(app, { fingerprint: 'eligible-1' });
  insertSentence(app, { fingerprint: 'ineligible-1' });
  markCompletedSessionItem(app, eligible.id);

  const response = await app.inject({ url: '/api/training/drill?limit=10' });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.total_eligible, 1);
  assert.deepEqual(body.items.map((item) => item.id), [eligible.id]);
  assert.deepEqual(Object.keys(body.items[0]).sort(), ['focus_ko', 'id', 'intent_ko', 'mastery_status', 'reference_en'].sort());
});

test('drill ordering puts sentences with a recent wrong result before others, then oldest-drilled first', async (t) => {
  const app = await prepareApp(t);
  const wrongOld = insertSentence(app, { fingerprint: 'wrong-old' });
  markCompletedSessionItem(app, wrongOld.id);
  const wrongRecent = insertSentence(app, { fingerprint: 'wrong-recent' });
  markCompletedSessionItem(app, wrongRecent.id);
  const neverDrilled = insertSentence(app, { fingerprint: 'never' });
  markCompletedSessionItem(app, neverDrilled.id);
  const drilledCorrectly = insertSentence(app, { fingerprint: 'drilled-ok' });
  markCompletedSessionItem(app, drilledCorrectly.id);

  const db = app.repos.training;
  db.recordDrillResult({ sentence_id: wrongOld.id, result: 'wrong', answer_text: 'x' });
  db.recordDrillResult({ sentence_id: wrongRecent.id, result: 'wrong', answer_text: 'x' });
  db.recordDrillResult({ sentence_id: drilledCorrectly.id, result: 'exact', answer_text: 'x' });

  const response = await app.inject({ url: '/api/training/drill?limit=10' });
  const ids = response.json().items.map((item) => item.id);
  assert.equal(ids[0], wrongRecent.id);
  assert.equal(ids[1], wrongOld.id);
  assert.equal(ids[2], neverDrilled.id);
  assert.equal(ids[3], drilledCorrectly.id);
});

test('drill results endpoint validates input and requires an existing sentence', async (t) => {
  const app = await prepareApp(t);
  const sentence = insertSentence(app, { fingerprint: 'valid-1' });
  markCompletedSessionItem(app, sentence.id);

  const missing = await app.inject({ method: 'POST', url: '/api/training/drill/results', payload: {} });
  assert.equal(missing.statusCode, 400);

  const badResult = await app.inject({
    method: 'POST',
    url: '/api/training/drill/results',
    payload: { sentence_id: sentence.id, result: 'nope', answer_text: 'x' },
  });
  assert.equal(badResult.statusCode, 400);

  const notFound = await app.inject({
    method: 'POST',
    url: '/api/training/drill/results',
    payload: { sentence_id: 999999, result: 'wrong', answer_text: 'x' },
  });
  assert.equal(notFound.statusCode, 404);

  const created = await app.inject({
    method: 'POST',
    url: '/api/training/drill/results',
    payload: { sentence_id: sentence.id, result: 'self_pass', answer_text: 'My answer.' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().result, 'self_pass');
});

test('drill routes are authenticated', async (t) => {
  const auth = { passwordHash: hashPassword('correct-password'), sessionSecret: 'drill-test-secret' };
  const app = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => app.close());
  const response = await app.inject({ url: '/api/training/drill' });
  assert.equal(response.statusCode, 401);
});
