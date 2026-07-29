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

export function createDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  migrateAttemptsTable(db);
  return db;
}
