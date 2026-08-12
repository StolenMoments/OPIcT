CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('survey','roleplay')),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attempts (
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
CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_text TEXT NOT NULL,
  cli TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  raw_output TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  text_en TEXT NOT NULL,
  memo TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','correction')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_sentences (
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

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building','ready','in_progress','completed','empty','error')),
  cli TEXT NOT NULL,
  model TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  raw_output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS training_session_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  sentence_id INTEGER NOT NULL REFERENCES training_sentences(id),
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','grading_first','awaiting_revision','first_error','grading_revision','revision_error','completed')),
  outcome TEXT CHECK (outcome IN ('first_try_pass','hint_pass','review')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(session_id, sentence_id),
  UNIQUE(session_id, position)
);

CREATE TABLE IF NOT EXISTS training_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_item_id INTEGER NOT NULL REFERENCES training_session_items(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no IN (1,2)),
  answer_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error')),
  verdict_json TEXT,
  raw_output TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(session_item_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_training_review ON training_sentences(session_count, next_review_on);
CREATE INDEX IF NOT EXISTS idx_training_items_session ON training_session_items(session_id, position);
CREATE INDEX IF NOT EXISTS idx_training_answers_item ON training_answers(session_item_id, attempt_no);
