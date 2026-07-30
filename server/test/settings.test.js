import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

test('settings upsert and read', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-haiku-4-5-20251001' } });
  const res = await app.inject({ url: '/api/settings' });
  assert.equal(res.json().default_cli, 'claude');
});

test('correction falls back to default cli/model', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-haiku-4-5-20251001' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 202);
  const row = (await app.inject({ url: `/api/corrections/${res.json().id}` })).json();
  assert.equal(row.cli, 'claude');
  assert.equal(row.model, 'claude-haiku-4-5-20251001');
});

test('PUT /api/settings rejects unknown default_cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'nope' } });
  assert.equal(res.statusCode, 400);
});

test('PUT /api/settings rejects model outside cli allowlist', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_model_claude: 'not-a-real-model' } });
  assert.equal(res.statusCode, 400);
});

test('PUT /api/settings passes through unrelated keys unvalidated', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { whisper_model: 'tiny.en' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().whisper_model, 'tiny.en');
});

test('PUT /api/settings rejects non-string/nested default_cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: { nested: true } } });
  assert.equal(res.statusCode, 400);
});

test('correction: default_cli set but its default_model_<cli> missing rejected with 400', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 400);
});

test('PUT /api/settings accepts default_input_mode record/text', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_input_mode: 'text' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().default_input_mode, 'text');
});

test('PUT /api/settings rejects invalid default_input_mode', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_input_mode: 'video' } });
  assert.equal(res.statusCode, 400);
});
