export async function questionsRoutes(app) {
  const repo = app.repos.questions;

  app.get('/api/questions', async (req) => repo.list(req.query.category_id));

  app.post('/api/questions', async (req, reply) => {
    const { category_id, text, note = null } = req.body ?? {};
    if (!category_id || !text?.trim()) return reply.code(400).send({ error: 'category_id와 text는 필수입니다' });
    if (!app.repos.categories.get(category_id))
      return reply.code(400).send({ error: '존재하지 않는 category_id입니다' });
    return reply.code(201).send(repo.create({ category_id, text: text.trim(), note }));
  });

  app.put('/api/questions/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const body = req.body ?? {};
    const { text = row.text, note = row.note, category_id = row.category_id } = body;
    if (body.text !== undefined && !text?.trim())
      return reply.code(400).send({ error: 'text는 빈 값일 수 없습니다' });
    if (body.category_id !== undefined && !app.repos.categories.get(category_id))
      return reply.code(400).send({ error: '존재하지 않는 category_id입니다' });
    return repo.update(row.id, { text: text.trim(), note, category_id });
  });

  app.delete('/api/questions/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
