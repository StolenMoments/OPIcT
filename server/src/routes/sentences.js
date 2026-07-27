export async function sentencesRoutes(app) {
  const repo = app.repos.sentences;

  app.get('/api/sentences', async (req) => repo.list(req.query.category_id));

  app.post('/api/sentences', async (req, reply) => {
    const { category_id, text_en, memo = null, source = 'manual' } = req.body ?? {};
    if (!category_id || !text_en?.trim()) return reply.code(400).send({ error: 'category_id와 text_en은 필수입니다' });
    if (!app.repos.categories.get(category_id))
      return reply.code(400).send({ error: '존재하지 않는 category_id입니다' });
    return reply.code(201).send(repo.create({ category_id, text_en: text_en.trim(), memo, source }));
  });

  app.put('/api/sentences/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { text_en = row.text_en, memo = row.memo } = req.body ?? {};
    return repo.update(row.id, { text_en, memo });
  });

  app.delete('/api/sentences/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
