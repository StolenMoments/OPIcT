import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

const STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));
const STUB_BAD_JSON = fileURLToPath(new URL('./fixtures/stub-cli-bad-json.js', import.meta.url));
const STUB_FAIL = fileURLToPath(new URL('./fixtures/stub-cli-fail.js', import.meta.url));
const STUB_VERIFICATION = fileURLToPath(new URL('./fixtures/stub-cli-verification.js', import.meta.url));
const STUB_BAD_VERIFICATION = fileURLToPath(new URL('./fixtures/stub-cli-bad-verification.js', import.meta.url));

process.env.OPICT_CLI_STUB = STUB;

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
    payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-sonnet-5' } });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/corrections/${res.json().id}`);
  assert.equal(row.status, 'done');
  const result = JSON.parse(row.result_json);
  assert.ok(result.corrected.length > 0);
  assert.ok(row.raw_output.length > 0); // 원문 보존
});

test('correction pipeline saves the second CLI verification result', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  process.env.OPICT_CLI_STUB = STUB_VERIFICATION;
  try {
    const res = await app.inject({ method: 'POST', url: '/api/corrections',
      payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-sonnet-5' } });
    const row = await waitDone(app, `/api/corrections/${res.json().id}`);

    assert.equal(row.status, 'done');
    assert.equal(JSON.parse(row.result_json).corrected, 'I have been jogging every morning for two years.');
  } finally {
    process.env.OPICT_CLI_STUB = STUB;
  }
});

test('correction treats an unparseable verification result as an error and preserves its raw output', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  process.env.OPICT_CLI_STUB = STUB_BAD_VERIFICATION;
  try {
    const res = await app.inject({ method: 'POST', url: '/api/corrections',
      payload: { input_text: 'I go yesterday.', cli: 'claude', model: 'claude-sonnet-5' } });
    const row = await waitDone(app, `/api/corrections/${res.json().id}`);

    assert.equal(row.status, 'error');
    assert.equal(row.result_json, null);
    assert.match(row.error_message, /결과 검증 JSON 파싱 실패/);
    assert.match(row.raw_output, /not valid JSON from verification/);
  } finally {
    process.env.OPICT_CLI_STUB = STUB;
  }
});

test('unknown cli rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'x', cli: 'nope', model: 'm' } });
  assert.equal(res.statusCode, 400);
});

test('model outside cli allowlist rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'x', cli: 'claude', model: 'not-a-real-model; rm -rf /' } });
  assert.equal(res.statusCode, 400);
});

test('unparseable cli output preserves raw_output', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  process.env.OPICT_CLI_STUB = STUB_BAD_JSON;
  try {
    const res = await app.inject({ method: 'POST', url: '/api/corrections',
      payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-sonnet-5' } });
    assert.equal(res.statusCode, 202);
    const row = await waitDone(app, `/api/corrections/${res.json().id}`);
    assert.equal(row.status, 'error');
    assert.ok(row.raw_output && row.raw_output.length > 0); // 원문 보존
  } finally {
    process.env.OPICT_CLI_STUB = STUB;
  }
});

test('cli exiting non-zero after writing stdout preserves raw_output', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  process.env.OPICT_CLI_STUB = STUB_FAIL;
  try {
    const res = await app.inject({ method: 'POST', url: '/api/corrections',
      payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-sonnet-5' } });
    assert.equal(res.statusCode, 202);
    const row = await waitDone(app, `/api/corrections/${res.json().id}`);
    assert.equal(row.status, 'error');
    assert.ok(row.raw_output && row.raw_output.includes('partial output before failure')); // 실패 전 출력 보존
  } finally {
    process.env.OPICT_CLI_STUB = STUB;
  }
});
