import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../src/db.js';

async function withDb() {
  const dir = await mkdtemp(join(tmpdir(), 'opict-db-migration-'));
  const file = join(dir, 'opict.db');
  return { file, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('startup migration upgrades only the legacy Antigravity default', async (t) => {
  const { file, cleanup } = await withDb();
  const initial = createDb(file);
  initial.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_model_agy', 'gemini-3.7-flash');
  initial.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_model_claude', 'custom-value');
  initial.prepare('INSERT INTO categories (type, name) VALUES (?, ?)').run('survey', 'Travel');
  initial.prepare('INSERT INTO questions (category_id, text) VALUES (1, ?)').run('Describe a trip.');
  initial.prepare(`INSERT INTO attempts (question_id, cli, model, status) VALUES (1, ?, ?, ?)`)
    .run('agy', 'gemini-3.7-flash', 'done');
  initial.close();

  const migrated = createDb(file);
  t.after(async () => { migrated.close(); await cleanup(); });
  assert.equal(migrated.prepare("SELECT value FROM settings WHERE key='default_model_agy'").get().value,
    'gemini-3.8-flash-low');
  assert.equal(migrated.prepare("SELECT value FROM settings WHERE key='default_model_claude'").get().value,
    'custom-value');
  assert.deepEqual(migrated.prepare('SELECT cli, model, status FROM attempts').get(),
    { cli: 'agy', model: 'gemini-3.7-flash', status: 'done' });
});

test('startup migration leaves missing and non-legacy Antigravity defaults unchanged', async (t) => {
  const { file, cleanup } = await withDb();
  const initial = createDb(file);
  initial.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_model_agy', 'some-user-choice');
  initial.close();

  const migrated = createDb(file);
  t.after(async () => { migrated.close(); await cleanup(); });
  assert.equal(migrated.prepare("SELECT value FROM settings WHERE key='default_model_agy'").get().value,
    'some-user-choice');
  assert.equal(migrated.prepare("SELECT value FROM settings WHERE key='missing'").get(), undefined);
});
