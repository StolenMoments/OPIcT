import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

async function waitDone(app, url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = (await app.inject({ url })).json();
    if (row.status === 'done' || row.status === 'error') return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for done');
}

test('correction pipeline with stub cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());

  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-fable-5' } });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/corrections/${res.json().id}`);
  assert.equal(row.status, 'done');
  const result = JSON.parse(row.result_json);
  assert.ok(result.corrected.length > 0);
  assert.ok(row.raw_output.length > 0); // 원문 보존
});

test('unknown cli rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'x', cli: 'nope', model: 'm' } });
  assert.equal(res.statusCode, 400);
});
