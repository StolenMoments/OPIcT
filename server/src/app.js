import Fastify from 'fastify';
import { createDb } from './db.js';
import { createRepos } from './repo/index.js';

export async function buildApp({ dbFile = 'data/opict.db', logger = false } = {}) {
  const app = Fastify({ logger });
  app.decorate('repos', createRepos(createDb(dbFile)));
  app.get('/api/health', async () => ({ ok: true }));
  app.addHook('onClose', async () => app.repos.close());
  return app;
}
