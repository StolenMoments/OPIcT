import { escapeLikeContains } from './search.js';

export function attemptsRepo(db) {
  return {
    create({ question_id, audio_path = null, input_mode = 'audio', transcript = null, status = 'uploaded', cli, model }) {
      const info = db.prepare(
        `INSERT INTO attempts (question_id,audio_path,input_mode,transcript,cli,model,status)
         VALUES (?,?,?,?,?,?,?)`
      ).run(question_id, audio_path, input_mode, transcript, cli, model, status);
      return this.get(info.lastInsertRowid);
    },
    get(id) {
      return db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
    },
    list({ limit, offset, search }) {
      const where = search ? "WHERE LOWER(q.text) LIKE LOWER(?) ESCAPE '\\'" : '';
      const params = search ? [escapeLikeContains(search)] : [];
      const total = db.prepare(
        `SELECT COUNT(*) AS total FROM attempts a JOIN questions q ON q.id=a.question_id ${where}`
      ).get(...params).total;
      const items = db.prepare(
        `SELECT a.*, q.text AS question_text FROM attempts a JOIN questions q ON q.id=a.question_id ${where}
         ORDER BY a.id DESC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);
      return { items, total };
    },
    setStatus(id, changes) {
      const fields = ['status=?'];
      const values = [changes.status];
      for (const field of ['transcript', 'result_json', 'raw_output', 'error_message']) {
        if (Object.hasOwn(changes, field)) {
          fields.push(`${field}=?`);
          values.push(changes[field]);
        }
      }
      values.push(id);
      db.prepare(`UPDATE attempts SET ${fields.join(', ')} WHERE id=?`).run(...values);
      return this.get(id);
    },
  };
}
