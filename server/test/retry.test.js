import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));
process.env.OPICT_STT_STUB = fileURLToPath(new URL('./fixtures/stub-stt.js', import.meta.url));

async function waitDone(app, url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = (await app.inject({ url })).json();
    if (row.status === 'done' || row.status === 'error') return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timeout waiting for done');
}

test('correction retry resets and reruns same record', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const { id } = (await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'He go to school.', cli: 'claude', model: 'claude-haiku-4-5-20251001' } })).json();

  const completed = await waitDone(app, `/api/corrections/${id}`);
  assert.equal(completed.status, 'done');

  const retry = await app.inject({ method: 'POST', url: `/api/corrections/${id}/retry` });
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.json().id, id);

  const retried = await waitDone(app, `/api/corrections/${id}`);
  assert.equal(retried.status, 'done');
  assert.equal((await app.inject({ url: '/api/corrections' })).json().length, 1);
});

test('attempt retry reruns the same record and serves its audio', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const category = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '운동' } })).json();
  const question = (await app.inject({ method: 'POST', url: '/api/questions',
    payload: { category_id: category.id, text: 'Tell me about your exercise.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'answer.webm');
  form.append('question_id', String(question.id));
  form.append('cli', 'claude');
  form.append('model', 'claude-haiku-4-5-20251001');
  const created = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(created.statusCode, 202);
  const id = created.json().id;
  const completed = await waitDone(app, `/api/attempts/${id}`);
  t.after(async () => {
    if (existsSync(completed.audio_path)) await unlink(completed.audio_path).catch(() => {});
  });

  const audio = await app.inject({ url: `/api/attempts/${id}/audio` });
  assert.equal(audio.statusCode, 200);
  assert.equal(audio.headers['content-type'], 'audio/webm');
  assert.equal(audio.body, 'fake-webm');

  const retry = await app.inject({ method: 'POST', url: `/api/attempts/${id}/retry` });
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.json().id, id);
  assert.equal((await waitDone(app, `/api/attempts/${id}`)).status, 'done');
  assert.equal((await app.inject({ url: '/api/attempts' })).json().length, 1);
});

test('text-mode attempt retry resets to evaluating (not uploaded) and reruns with the same script', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const category = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '여행' } })).json();
  const question = (await app.inject({ method: 'POST', url: '/api/questions',
    payload: { category_id: category.id, text: 'Tell me about your last trip.' } })).json();

  const scriptText = 'I visited Busan last summer.';
  const created = await app.inject({
    method: 'POST',
    url: '/api/attempts',
    payload: { question_id: question.id, script_text: scriptText, cli: 'claude', model: 'claude-haiku-4-5-20251001' },
  });
  assert.equal(created.statusCode, 202);
  const id = created.json().id;
  const completed = await waitDone(app, `/api/attempts/${id}`);
  assert.equal(completed.status, 'done');

  const retry = await app.inject({ method: 'POST', url: `/api/attempts/${id}/retry` });
  assert.equal(retry.statusCode, 202);
  const justAfterRetry = (await app.inject({ url: `/api/attempts/${id}` })).json();
  assert.notEqual(justAfterRetry.status, 'uploaded');

  const retried = await waitDone(app, `/api/attempts/${id}`);
  assert.equal(retried.status, 'done');
  assert.equal(retried.transcript, scriptText);
});

test('retry and audio routes return 404 for missing records', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());

  for (const url of ['/api/attempts/999/retry', '/api/corrections/999/retry', '/api/attempts/999/audio']) {
    const response = await app.inject({ method: url.endsWith('/retry') ? 'POST' : 'GET', url });
    assert.equal(response.statusCode, 404, url);
    assert.deepEqual(response.json(), { error: 'not found' }, url);
  }
});

test('audio route returns exact 404 body when an existing attempt file is missing', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const category = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '여행' } })).json();
  const question = (await app.inject({ method: 'POST', url: '/api/questions',
    payload: { category_id: category.id, text: 'Tell me about your last trip.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'answer.webm');
  form.append('question_id', String(question.id));
  form.append('cli', 'claude');
  form.append('model', 'claude-haiku-4-5-20251001');
  const created = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(created.statusCode, 202);

  const completed = await waitDone(app, `/api/attempts/${created.json().id}`);
  assert.equal(completed.status, 'done');
  await unlink(completed.audio_path);
  assert.equal(existsSync(completed.audio_path), false);

  const response = await app.inject({ url: `/api/attempts/${completed.id}/audio` });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: 'not found' });
});
