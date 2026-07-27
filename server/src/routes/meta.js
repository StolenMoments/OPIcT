import { CLIS } from '../ai/clis.js';

export async function metaRoutes(app) {
  app.get('/api/meta/clis', async () =>
    Object.entries(CLIS).map(([name, d]) => ({ name, label: d.label, models: d.models })));
}
