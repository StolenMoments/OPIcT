export function correctionsRepo(db) {
  return {
    create({ input_text, cli, model }) {
      const info = db.prepare("INSERT INTO corrections (input_text,cli,model,status) VALUES (?,?,?,'pending')")
        .run(input_text, cli, model);
      return this.get(info.lastInsertRowid);
    },
    get(id) {
      return db.prepare('SELECT * FROM corrections WHERE id=?').get(id);
    },
    list() {
      return db.prepare('SELECT * FROM corrections ORDER BY id DESC').all();
    },
    setStatus(id, { status, result_json = null, raw_output = null, error_message = null }) {
      db.prepare('UPDATE corrections SET status=?, result_json=COALESCE(?,result_json), raw_output=COALESCE(?,raw_output), error_message=? WHERE id=?')
        .run(status, result_json, raw_output, error_message, id);
      return this.get(id);
    },
  };
}
