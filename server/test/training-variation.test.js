import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { runTrainingSession } from '../src/pipelines/training.js';

const VARIATION_STUB = fileURLToPath(new URL('./fixtures/stub-cli-variation.js', import.meta.url));
const FAIL_STUB = fileURLToPath(new URL('./fixtures/stub-cli-fail.js', import.meta.url));

async function prepareApp(t) {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  return app;
}

function insertMasteredSentence(app, overrides) {
  app.repos.training.insertSentence({
    source_type: 'correction',
    source_id: overrides.source_id ?? Math.floor(Math.random() * 1_000_000),
    source_snapshot_json: JSON.stringify({ source_type: 'correction', source_id: 1, source_text: 't', result: {} }),
    source_sentence: overrides.source_sentence ?? 'Source sentence.',
    intent_ko: overrides.intent_ko ?? '의도',
    reference_en: overrides.reference_en,
    focus_ko: overrides.focus_ko ?? '초점',
    fingerprint: overrides.fingerprint,
  });
  const sentence = app.repos.training.listSentences().find((s) => s.fingerprint === overrides.fingerprint);
  const session = app.repos.training.createSession({ cli: 'claude', model: 'claude-sonnet-5' });
  app.repos.training.addSessionItems(session.id, [{ id: sentence.id }]);
  const item = app.repos.training.listSessionItems(session.id)[0];
  app.repos.training.setSessionStatus(session.id, { status: 'ready' });
  const answer = app.repos.training.createAnswer(item.id, 'draft', 1);
  app.repos.training.completeAnswer(
    answer.id,
    JSON.stringify({ passes: true, areas: {}, hint_ko: '' }),
    null,
    'first_try_pass',
    { mastery_status: 'mastered', first_pass_streak: 2, next_review_on: '2026-09-05' },
  );
  return app.repos.training.getSentence(sentence.id);
}

function insertUnseenSentence(app, fingerprint) {
  app.repos.training.insertSentence({
    source_type: 'correction',
    source_id: Math.floor(Math.random() * 1_000_000),
    source_snapshot_json: JSON.stringify({ source_type: 'correction', source_id: 1, source_text: 't', result: {} }),
    source_sentence: 'Unseen source.',
    intent_ko: '아직 안 본 문장',
    reference_en: 'Unseen sentence.',
    focus_ko: '초점',
    fingerprint,
  });
}

test('a ready session generates capped, deduped pattern-variation drills for mastered parents', async (t) => {
  const app = await prepareApp(t);
  const parentA = insertMasteredSentence(app, { reference_en: 'I go to work every day.', fingerprint: 'parent-a' });
  const parentB = insertMasteredSentence(app, { reference_en: 'I have finished my homework.', fingerprint: 'parent-b' });
  insertUnseenSentence(app, 'unseen-1');

  process.env.OPICT_CLI_STUB = VARIATION_STUB;
  const session = app.repos.training.createSession({ cli: 'claude', model: 'claude-sonnet-5' });
  await runTrainingSession(app.repos, session.id, () => new Date('2026-08-21T03:00:00.000Z'));

  assert.equal(app.repos.training.getSession(session.id).status, 'ready');

  const variationsOfA = app.repos.training.listSentences().filter((s) => s.parent_id === parentA.id);
  assert.equal(variationsOfA.length, 2, 'duplicate reference_en within the batch should dedupe to one row');
  assert.deepEqual(variationsOfA.map((s) => s.variation_kind).sort(), ['subject', 'tense']);

  const variationsOfB = app.repos.training.listSentences().filter((s) => s.parent_id === parentB.id);
  assert.equal(variationsOfB.length, 2);

  assert.equal(app.repos.training.listMasteredWithoutVariation(10).length, 0);
});

test('a failed variation generation never blocks the session from becoming ready', async (t) => {
  const app = await prepareApp(t);
  insertMasteredSentence(app, { reference_en: 'I go to work every day.', fingerprint: 'parent-fail' });
  insertUnseenSentence(app, 'unseen-2');

  process.env.OPICT_CLI_STUB = FAIL_STUB;
  const session = app.repos.training.createSession({ cli: 'claude', model: 'claude-sonnet-5' });
  await runTrainingSession(app.repos, session.id, () => new Date('2026-08-21T03:00:00.000Z'));

  const finished = app.repos.training.getSession(session.id);
  assert.equal(finished.status, 'ready');
  assert.equal(app.repos.training.listSentences().some((s) => s.parent_id != null), false);

  process.env.OPICT_CLI_STUB = VARIATION_STUB;
});

test('a mastered parent that already has a variation is not selected again', async (t) => {
  const app = await prepareApp(t);
  const parent = insertMasteredSentence(app, { reference_en: 'I go to work every day.', fingerprint: 'parent-existing' });
  app.repos.training.insertSentence({
    source_type: 'correction',
    source_id: 999,
    source_snapshot_json: '{}',
    source_sentence: 'Existing variation source.',
    intent_ko: '이미 있는 변형',
    reference_en: 'Existing variation sentence.',
    focus_ko: '초점',
    fingerprint: 'existing-variation',
    parent_id: parent.id,
    variation_kind: 'tense',
  });

  assert.deepEqual(app.repos.training.listMasteredWithoutVariation(10), []);
});
