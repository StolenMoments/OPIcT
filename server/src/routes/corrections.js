import { CLIS } from '../ai/clis.js';
import { enqueue } from '../ai/queue.js';
import { runCorrection } from '../pipelines/correction.js';

export async function correctionsRoutes(app) {
  const repos = app.repos;

  app.post('/api/corrections', async (req, reply) => {
    const body = req.body ?? {};
    const s = repos.settings.getAll();
    const cli = body.cli ?? s.default_cli;
    const model = body.model ?? (CLIS[cli] ? s[`default_model_${cli}`] : undefined);
    if (!body.input_text?.trim() || !CLIS[cli] || !model || !CLIS[cli].models.includes(model))
      return reply.code(400).send({ error: 'input_text 필수, cli/model 미지정 시 설정의 기본값이 있어야 합니다' });
    const row = repos.corrections.create({ input_text: body.input_text.trim(), cli, model });
    enqueue(() => runCorrection(repos, row.id)); // 응답과 분리해 백그라운드 직렬 실행
    return reply.code(202).send({ id: row.id });
  });

  app.get('/api/corrections', async () => repos.corrections.list());
  app.get('/api/corrections/:id', async (req, reply) => {
    const row = repos.corrections.get(req.params.id);
    return row ?? reply.code(404).send({ error: 'not found' });
  });
}
