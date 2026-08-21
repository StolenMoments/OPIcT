import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../src/db.js';

function seedLegacyDb(file) {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE training_sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK (source_type IN ('attempt','correction')),
      source_id INTEGER NOT NULL,
      source_snapshot_json TEXT NOT NULL,
      source_sentence TEXT NOT NULL,
      intent_ko TEXT NOT NULL,
      reference_en TEXT NOT NULL,
      focus_ko TEXT NOT NULL,
      fingerprint TEXT NOT NULL UNIQUE,
      mastery_status TEXT NOT NULL DEFAULT 'learning' CHECK (mastery_status IN ('learning','mastered')),
      first_pass_streak INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      next_review_on TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE training_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'building',
      cli TEXT NOT NULL,
      model TEXT NOT NULL,
      error_code TEXT,
      error_message TEXT,
      raw_output TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE TABLE training_session_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
      sentence_id INTEGER NOT NULL REFERENCES training_sentences(id),
      position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      outcome TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(session_id, sentence_id),
      UNIQUE(session_id, position)
    );
    CREATE INDEX idx_training_review ON training_sentences(session_count, next_review_on);
  `);
  db.prepare(
    `INSERT INTO training_sentences
     (id, source_type, source_id, source_snapshot_json, source_sentence, intent_ko, reference_en, focus_ko, fingerprint)
     VALUES (1,'correction',1,'{}','Legacy source.','레거시 의도','Legacy reference.','레거시 초점','legacy-fp')`,
  ).run();
  db.prepare(`INSERT INTO training_sessions (id, cli, model, status) VALUES (1,'claude','claude-sonnet-5','ready')`).run();
  db.prepare(
    `INSERT INTO training_session_items (session_id, sentence_id, position, status) VALUES (1,1,1,'pending')`,
  ).run();
  db.close();
}

test('training_sentences legacy table upgrades in place, keeps rows and the incoming FK, and re-runs as a no-op', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'opict-migration-'));
  const file = join(dir, 'legacy.db');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  seedLegacyDb(file);

  const db = createDb(file);
  const legacyRow = db.prepare('SELECT * FROM training_sentences WHERE id=1').get();
  assert.equal(legacyRow.source_sentence, 'Legacy source.');
  assert.equal(legacyRow.fingerprint, 'legacy-fp');
  assert.equal(legacyRow.parent_id, null);
  assert.equal(legacyRow.variation_kind, null);

  const item = db.prepare('SELECT * FROM training_session_items WHERE id=1').get();
  assert.equal(item.sentence_id, 1);

  assert.doesNotThrow(() => {
    db.prepare(
      `INSERT INTO training_sentences
       (source_type, source_id, source_snapshot_json, source_sentence, intent_ko, reference_en, focus_ko, fingerprint)
       VALUES ('note',5,'{}','Note source.','노트 의도','Note reference.','노트 초점','note-fp')`,
    ).run();
  });

  db.prepare('DELETE FROM training_sessions WHERE id=1').run();
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM training_session_items WHERE session_id=1').get().c, 0);

  db.close();

  const reopened = createDb(file);
  const stillLegacy = reopened.prepare('SELECT * FROM training_sentences WHERE id=1').get();
  assert.equal(stillLegacy.source_sentence, 'Legacy source.');
  const stillNote = reopened.prepare('SELECT * FROM training_sentences WHERE fingerprint=?').get('note-fp');
  assert.equal(stillNote.source_type, 'note');
  reopened.close();
});
