export function categoriesRepo(db) {
  return {
    list(type) {
      return type
        ? db.prepare('SELECT * FROM categories WHERE type=? ORDER BY sort_order,id').all(type)
        : db.prepare('SELECT * FROM categories ORDER BY sort_order,id').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    },
    create({ type, name, sort_order = 0 }) {
      const info = db.prepare('INSERT INTO categories (type,name,sort_order) VALUES (?,?,?)').run(type, name, sort_order);
      return this.get(info.lastInsertRowid);
    },
    update(id, { name, sort_order }) {
      db.prepare('UPDATE categories SET name=?, sort_order=? WHERE id=?').run(name, sort_order, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM categories WHERE id=?').run(id);
    },
  };
}
