import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

// schema.sql은 CREATE TABLE IF NOT EXISTS만 실행하므로 이미 만들어진 로컬 DB의 컬럼
// 정의는 바꾸지 못한다. 마이그레이션 시스템이 없는 프로토타입이라, audio_path의
// NOT NULL을 없애야 하는 이번 변경만 시작 시 1회 가드된 테이블 재생성으로 처리한다.
function migrateAttemptsTable(db) {
  const columns = db.prepare('PRAGMA table_info(attempts)').all();
  const audioPathCol = columns.find((c) => c.name === 'audio_path');
  if (!audioPathCol || audioPathCol.notnull !== 1) return;

  db.exec(`
    ALTER TABLE attempts RENAME TO attempts_old;
    CREATE TABLE attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      audio_path TEXT,
      input_mode TEXT NOT NULL DEFAULT 'audio' CHECK (input_mode IN ('audio','text')),
      transcript TEXT,
      cli TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      result_json TEXT,
      raw_output TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO attempts (id, question_id, audio_path, transcript, cli, model, status, result_json, raw_output, error_message, created_at)
      SELECT id, question_id, audio_path, transcript, cli, model, status, result_json, raw_output, error_message, created_at FROM attempts_old;
    DROP TABLE attempts_old;
  `);
}

// training_sentences also has no migration system. This one CHECK/column
// change (adding 'note' to source_type, plus the parent_id/variation_kind
// columns needed by pattern-variation drills) is folded into a single
// guarded recreation so a local DB only pays the rename cost once, even
// though the two features shipped in separate steps. training_session_items
// holds an incoming FK to this table, so foreign_keys is turned off for the
// whole rename sequence and the replacement table keeps the final name
// ("training_sentences") in its own self-referencing parent_id FK — SQLite
// resolves FK target names by the table's name at enforcement time, not at
// CREATE TABLE time, so this only becomes consistent (and is only checked)
// after foreign_keys is turned back on below.
function migrateTrainingSentencesTable(db) {
  const table = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='training_sentences'`,
  ).get();
  if (!table || table.sql.includes("'note'")) return;

  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE training_sentences_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL CHECK (source_type IN ('attempt','correction','note')),
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
      parent_id INTEGER REFERENCES training_sentences(id),
      variation_kind TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO training_sentences_new
      (id, source_type, source_id, source_snapshot_json, source_sentence, intent_ko, reference_en,
       focus_ko, fingerprint, mastery_status, first_pass_streak, session_count, next_review_on,
       created_at, updated_at)
      SELECT id, source_type, source_id, source_snapshot_json, source_sentence, intent_ko, reference_en,
       focus_ko, fingerprint, mastery_status, first_pass_streak, session_count, next_review_on,
       created_at, updated_at
      FROM training_sentences;
    DROP TABLE training_sentences;
    ALTER TABLE training_sentences_new RENAME TO training_sentences;
    CREATE INDEX IF NOT EXISTS idx_training_review ON training_sentences(session_count, next_review_on);
  `);
  db.pragma('foreign_keys = ON');
}

export function createDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  migrateAttemptsTable(db);
  migrateTrainingSentencesTable(db);
  return db;
}
