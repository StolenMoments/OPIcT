export function sentencesRepo(db) {
  return {
    list(categoryId) {
      return categoryId
        ? db.prepare('SELECT * FROM sentences WHERE category_id=? ORDER BY id DESC').all(categoryId)
        : db.prepare('SELECT * FROM sentences ORDER BY id DESC').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM sentences WHERE id=?').get(id);
    },
    create({ category_id, text_en, memo = null, source = 'manual' }) {
      const info = db.prepare('INSERT INTO sentences (category_id,text_en,memo,source) VALUES (?,?,?,?)')
        .run(category_id, text_en, memo, source);
      return this.get(info.lastInsertRowid);
    },
    update(id, { text_en, memo }) {
      db.prepare('UPDATE sentences SET text_en=?, memo=? WHERE id=?').run(text_en, memo, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM sentences WHERE id=?').run(id);
    },
  };
}
