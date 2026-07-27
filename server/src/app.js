import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createRepos } from './repo/index.js';
import { categoriesRoutes } from './routes/categories.js';
import { questionsRoutes } from './routes/questions.js';
import { sentencesRoutes } from './routes/sentences.js';
import { correctionsRoutes } from './routes/corrections.js';
import { settingsRoutes } from './routes/settings.js';
import { metaRoutes } from './routes/meta.js';

export async function buildApp({ dbFile = 'data/opict.db', logger = false } = {}) {
  const app = Fastify({ logger });
  app.decorate('repos', createRepos(createDb(dbFile)));
  app.get('/api/health', async () => ({ ok: true }));
  await app.register(categoriesRoutes);
  await app.register(questionsRoutes);
  await app.register(sentencesRoutes);
  await app.register(correctionsRoutes);
  await app.register(settingsRoutes);
  await app.register(metaRoutes);
  app.addHook('onClose', async () => app.repos.close());

  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api')
        ? reply.sendFile('index.html')
        : reply.code(404).send({ error: 'not found' }));
  }

  return app;
}
