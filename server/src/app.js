import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
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
import { attemptsRoutes } from './routes/attempts.js';
import { retryRoutes } from './routes/retry.js';
import { authRoutes } from './routes/auth.js';
import { registerAuthHook, resolveAuthConfig } from './auth/auth-plugin.js';
import { trainingRoutes } from './routes/training.js';

export async function buildApp({ dbFile = 'data/opict.db', logger = false, auth, now = () => new Date() } = {}) {
  const authConfig = auth === undefined
    ? (process.env.NODE_ENV === 'production' ? resolveAuthConfig() : null)
    : resolveAuthConfig(auth);
  const app = Fastify({ logger, trustProxy: ['127.0.0.1', '::1'] });
  app.decorate('repos', createRepos(createDb(dbFile)));
  app.decorate('now', now);
  registerAuthHook(app, authConfig);
  app.get('/api/health', async () => ({ ok: true }));
  await authRoutes(app, { auth: authConfig });
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(categoriesRoutes);
  await app.register(questionsRoutes);
  await app.register(sentencesRoutes);
  await app.register(correctionsRoutes);
  await app.register(settingsRoutes);
  await app.register(metaRoutes);
  await app.register(attemptsRoutes);
  await app.register(retryRoutes);
  await app.register(trainingRoutes);
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
