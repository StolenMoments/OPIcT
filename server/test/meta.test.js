import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('GET /api/meta/clis publishes the supported Antigravity and Codex models', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const response = await app.inject({ url: '/api/meta/clis' });
  assert.equal(response.statusCode, 200);
  const agy = response.json().find((cli) => cli.name === 'agy');
  assert.deepEqual(agy.models, ['gemini-3.8-flash-low']);
  const codex = response.json().find((cli) => cli.name === 'codex');
  assert.deepEqual(codex.models, ['gpt-6-luna']);
});
