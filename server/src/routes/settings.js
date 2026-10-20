import { CLIS, getCliModel } from '../ai/clis.js';

function settingsResponse(repos) {
  const settings = repos.settings.getAll();
  for (const key of Object.keys(settings)) {
    if (key.startsWith('default_model_')) delete settings[key];
  }
  // Old open pages still read these fields; model selection belongs to the server.
  for (const [cli, definition] of Object.entries(CLIS)) {
    settings[`default_model_${cli}`] = definition.model;
  }
  return settings;
}

export async function settingsRoutes(app) {
  app.get('/api/settings', async () => settingsResponse(app.repos));

  app.put('/api/settings', async (req, reply) => {
    const body = { ...req.body };
    if (body.default_cli !== undefined && !getCliModel(body.default_cli))
      return reply.code(400).send({ error: 'default_cli는 claude|codex|agy 중 하나여야 합니다' });
    if (body.default_input_mode !== undefined && !['record', 'text'].includes(body.default_input_mode))
      return reply.code(400).send({ error: 'default_input_mode는 record 또는 text 중 하나여야 합니다' });
    for (const key of Object.keys(body)) {
      if (key.startsWith('default_model_')) delete body[key];
    }
    app.repos.settings.set(body);
    return settingsResponse(app.repos);
  });
}
