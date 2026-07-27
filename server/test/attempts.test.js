import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { buildApp } from '../src/app.js';

const STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));
const STUB_FAIL = fileURLToPath(new URL('./fixtures/stub-cli-fail.js', import.meta.url));

process.env.OPICT_CLI_STUB = STUB;
process.env.OPICT_STT_STUB = fileURLToPath(new URL('./fixtures/stub-stt.js', import.meta.url));

// 업로드 라우트가 만든 오디오 파일은 테스트가 끝나면 지운다 — 반복 실행 시 누적 방지.
function cleanupUpload(t, audioPath) {
  t.after(async () => {
    if (audioPath && existsSync(audioPath)) await unlink(audioPath).catch(() => {});
  });
}

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
  form.append('model', 'claude-haiku-4-5-20251001');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/attempts/${res.json().id}`);
  cleanupUpload(t, row.audio_path);
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
  form.append('model', 'claude-haiku-4-5-20251001');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 400);
});

test('GET /api/attempts/:id 404 for missing id', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ url: '/api/attempts/999999' });
  assert.equal(res.statusCode, 404);
});

test('attempt pipeline preserves raw_output when the CLI exits non-zero after writing stdout', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Tell me about your jogging routine.' } })).json();

  process.env.OPICT_CLI_STUB = STUB_FAIL;
  try {
    const form = new FormData();
    form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
    form.append('question_id', String(q.id));
    form.append('cli', 'claude');
    form.append('model', 'claude-haiku-4-5-20251001');
    const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
    assert.equal(res.statusCode, 202);

    const row = await waitDone(app, `/api/attempts/${res.json().id}`);
    cleanupUpload(t, row.audio_path);
    assert.equal(row.status, 'error');
    assert.ok(row.raw_output && row.raw_output.includes('partial output before failure')); // 실패 전 출력 보존
  } finally {
    process.env.OPICT_CLI_STUB = STUB;
  }
});

test('POST /api/attempts rejects unknown cli with 400', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Tell me about your jogging routine.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
  form.append('question_id', String(q.id));
  form.append('cli', 'nope');
  form.append('model', 'm');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 400);
});

test('POST /api/attempts rejects model outside cli allowlist with 400', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Tell me about your jogging routine.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
  form.append('question_id', String(q.id));
  form.append('cli', 'claude');
  form.append('model', 'not-a-real-model; rm -rf /');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 400);
});
