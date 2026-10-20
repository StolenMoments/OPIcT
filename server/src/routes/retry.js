import { getCliModel } from '../ai/clis.js';
import { createReadStream, existsSync } from 'node:fs';
import { enqueue } from '../ai/queue.js';
import { runAttempt } from '../pipelines/attempt.js';
import { runCorrection } from '../pipelines/correction.js';

export async function retryRoutes(app) {
  const repos = app.repos;

  app.post('/api/attempts/:id/retry', async (req, reply) => {
    const row = repos.attempts.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const model = getCliModel(row.cli);
    if (!model) return reply.code(400).send({ error: '지원하지 않는 CLI입니다' });
    const resetStatus = row.input_mode === 'text' ? 'evaluating' : 'uploaded';
    repos.attempts.setStatus(row.id, { status: resetStatus, error_message: null });
    enqueue(() => runAttempt(repos, row.id, model));
    return reply.code(202).send({ id: row.id });
  });

  app.post('/api/corrections/:id/retry', async (req, reply) => {
    const row = repos.corrections.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const model = getCliModel(row.cli);
    if (!model) return reply.code(400).send({ error: '지원하지 않는 CLI입니다' });
    repos.corrections.setStatus(row.id, { status: 'pending', error_message: null });
    enqueue(() => runCorrection(repos, row.id, model));
    return reply.code(202).send({ id: row.id });
  });

  app.get('/api/attempts/:id/audio', async (req, reply) => {
    const row = repos.attempts.get(req.params.id);
    if (!row || !row.audio_path || !existsSync(row.audio_path)) return reply.code(404).send({ error: 'not found' });
    return reply.type('audio/webm').send(createReadStream(row.audio_path));
  });
}
