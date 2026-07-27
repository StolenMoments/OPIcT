import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));
process.env.OPICT_STT_STUB = fileURLToPath(new URL('./fixtures/stub-stt.js', import.meta.url));

async function waitDone(app, url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = (await app.inject({ url })).json();
    if (row.status === 'done' || row.status === 'error') return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout');
}

test('attempt pipeline: upload → transcribe → evaluate → done', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Tell me about your jogging routine.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
  form.append('question_id', String(q.id));
  form.append('cli', 'claude');
  form.append('model', 'claude-sonnet-5');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/attempts/${res.json().id}`);
  assert.equal(row.status, 'done');
  assert.ok(row.transcript.length > 0);
  assert.ok(JSON.parse(row.result_json));
});

test('POST /api/attempts rejects invalid question_id without leaving an orphaned upload', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
  form.append('question_id', '999999');
  form.append('cli', 'claude');
  form.append('model', 'claude-sonnet-5');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 400);
});

test('GET /api/attempts/:id 404 for missing id', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ url: '/api/attempts/999999' });
  assert.equal(res.statusCode, 404);
});
