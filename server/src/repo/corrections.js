import { escapeLikeContains } from './search.js';

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
    list({ limit, offset, search }) {
      const where = search ? "WHERE LOWER(input_text) LIKE LOWER(?) ESCAPE '\\'" : '';
      const params = search ? [escapeLikeContains(search)] : [];
      const total = db.prepare(`SELECT COUNT(*) AS total FROM corrections ${where}`).get(...params).total;
      const items = db.prepare(
        `SELECT * FROM corrections ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);
      return { items, total };
    },
    setStatus(id, { status, result_json = null, raw_output = null, error_message = null }) {
      db.prepare('UPDATE corrections SET status=?, result_json=COALESCE(?,result_json), raw_output=COALESCE(?,raw_output), error_message=? WHERE id=?')
        .run(status, result_json, raw_output, error_message, id);
      return this.get(id);
    },
  };
}
