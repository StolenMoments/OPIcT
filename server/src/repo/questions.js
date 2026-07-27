export function questionsRepo(db) {
  return {
    list(categoryId) {
      return categoryId
        ? db.prepare('SELECT * FROM questions WHERE category_id=? ORDER BY id').all(categoryId)
        : db.prepare('SELECT * FROM questions ORDER BY id').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM questions WHERE id=?').get(id);
    },
    create({ category_id, text, note = null }) {
      const info = db.prepare('INSERT INTO questions (category_id,text,note) VALUES (?,?,?)').run(category_id, text, note);
      return this.get(info.lastInsertRowid);
    },
    update(id, { text, note, category_id }) {
      db.prepare('UPDATE questions SET text=?, note=?, category_id=? WHERE id=?').run(text, note, category_id, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM questions WHERE id=?').run(id);
    },
  };
}
