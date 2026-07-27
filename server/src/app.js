import Fastify from 'fastify';
import { createDb } from './db.js';
import { createRepos } from './repo/index.js';
import { categoriesRoutes } from './routes/categories.js';
import { questionsRoutes } from './routes/questions.js';

export async function buildApp({ dbFile = 'data/opict.db', logger = false } = {}) {
  const app = Fastify({ logger });
  app.decorate('repos', createRepos(createDb(dbFile)));
  app.get('/api/health', async () => ({ ok: true }));
  await app.register(categoriesRoutes);
  await app.register(questionsRoutes);
  app.addHook('onClose', async () => app.repos.close());
  return app;
}
