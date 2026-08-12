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
    setStatus(id, changes) {
      const fields = ['status=?'];
      const values = [changes.status];
      for (const field of ['result_json', 'raw_output', 'error_message']) {
        if (Object.hasOwn(changes, field)) {
          fields.push(`${field}=?`);
          values.push(changes[field]);
        }
      }
      values.push(id);
      db.prepare(`UPDATE corrections SET ${fields.join(', ')} WHERE id=?`).run(...values);
      return this.get(id);
    },
  };
}
