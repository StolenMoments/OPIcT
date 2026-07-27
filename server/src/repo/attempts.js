export function attemptsRepo(db) {
  return {
    create({ question_id, audio_path, cli, model }) {
      const info = db.prepare("INSERT INTO attempts (question_id,audio_path,cli,model,status) VALUES (?,?,?,?,'uploaded')")
        .run(question_id, audio_path, cli, model);
      return this.get(info.lastInsertRowid);
    },
    get(id) {
      return db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
    },
    list() {
      return db.prepare(
        'SELECT a.*, q.text AS question_text FROM attempts a JOIN questions q ON q.id=a.question_id ORDER BY a.id DESC'
      ).all();
    },
    setStatus(id, { status, transcript = null, result_json = null, raw_output = null, error_message = null }) {
      db.prepare(`UPDATE attempts SET status=?, transcript=COALESCE(?,transcript),
        result_json=COALESCE(?,result_json), raw_output=COALESCE(?,raw_output), error_message=? WHERE id=?`)
        .run(status, transcript, result_json, raw_output, error_message, id);
      return this.get(id);
    },
  };
}
