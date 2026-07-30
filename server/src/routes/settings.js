import { CLIS } from '../ai/clis.js';

export async function settingsRoutes(app) {
  app.get('/api/settings', async () => app.repos.settings.getAll());

  app.put('/api/settings', async (req, reply) => {
    const body = req.body ?? {};
    if (body.default_cli !== undefined && !CLIS[body.default_cli])
      return reply.code(400).send({ error: 'default_cli는 claude|codex|agy 중 하나여야 합니다' });
    if (body.default_input_mode !== undefined && !['record', 'text'].includes(body.default_input_mode))
      return reply.code(400).send({ error: 'default_input_mode는 record 또는 text 중 하나여야 합니다' });
    for (const cli of Object.keys(CLIS)) {
      const key = `default_model_${cli}`;
      if (body[key] !== undefined && !CLIS[cli].models.includes(body[key]))
        return reply.code(400).send({ error: `${key}는 해당 cli의 지원 모델이어야 합니다` });
    }
    app.repos.settings.set(body);
    return app.repos.settings.getAll();
  });
}
