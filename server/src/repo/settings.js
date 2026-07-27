export function settingsRepo(db) {
  return {
    getAll() {
      return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
    },
    set(entries) {
      const stmt = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [k, v] of Object.entries(entries)) stmt.run(k, String(v));
    },
  };
}
