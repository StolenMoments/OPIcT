export async function categoriesRoutes(app) {
  const repo = app.repos.categories;

  app.get('/api/categories', async (req) => repo.list(req.query.type));

  app.post('/api/categories', async (req, reply) => {
    const { type, name, sort_order = 0 } = req.body ?? {};
    if (!['survey', 'roleplay'].includes(type) || !name?.trim())
      return reply.code(400).send({ error: 'type(survey|roleplay)과 name은 필수입니다' });
    return reply.code(201).send(repo.create({ type, name: name.trim(), sort_order }));
  });

  app.put('/api/categories/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { name = row.name, sort_order = row.sort_order } = req.body ?? {};
    return repo.update(row.id, { name, sort_order });
  });

  app.delete('/api/categories/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
