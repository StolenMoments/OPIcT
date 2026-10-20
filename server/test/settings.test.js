import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

test('Codex corrections need only a default CLI, not a saved model', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const saved = await app.inject({ method: 'PUT', url: '/api/settings',
    payload: { default_cli: 'codex' } });
  assert.equal(saved.statusCode, 200);
  const response = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'I go yesterday.' } });
  assert.equal(response.statusCode, 202);
  const url = `/api/corrections/${response.json().id}`;
  let result;
  const deadline = Date.now() + 5000;
  do {
    result = (await app.inject({ url })).json();
    if (result.status === 'done' || result.status === 'error') break;
    await setTimeout(50);
  } while (Date.now() < deadline);
  assert.equal(result.cli, 'codex');
  assert.equal(result.model, 'gpt-6-luna');
  assert.equal(result.status, 'done');
});

test('legacy model settings are ignored and responses expose server models', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const response = await app.inject({ method: 'PUT', url: '/api/settings',
    payload: { default_model_codex: 'arbitrary-model' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().default_model_codex, 'gpt-6-luna');
  assert.equal(app.repos.settings.getAll().default_model_codex, undefined);
  app.repos.settings.set({ default_model_codex: 'stale-db-value' });
  const settings = (await app.inject({ url: '/api/settings' })).json();
  assert.equal(settings.default_model_codex, 'gpt-6-luna');
});

test('settings upsert and read', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-sonnet-5' } });
  const res = await app.inject({ url: '/api/settings' });
  assert.equal(res.json().default_cli, 'claude');
});

test('correction falls back to default cli/model', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-sonnet-5' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 202);
  const row = (await app.inject({ url: `/api/corrections/${res.json().id}` })).json();
  assert.equal(row.cli, 'claude');
  assert.equal(row.model, 'claude-sonnet-5');
});

test('PUT /api/settings rejects unknown default_cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'nope' } });
  assert.equal(res.statusCode, 400);
});

test('PUT /api/settings ignores legacy model selection', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_model_claude: 'not-a-real-model' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().default_model_claude, 'claude-sonnet-5');
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

test('correction resolves the model when only default_cli is saved', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 202);
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
