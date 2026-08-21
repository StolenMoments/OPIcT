const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const RESULTS = ['exact', 'self_pass', 'wrong'];

function parseLimit(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return DEFAULT_LIMIT;
  const parsed = Number(value);
  return parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

export async function drillRoutes(app) {
  const repos = app.repos;

  app.get('/api/training/drill', async (req) => {
    const limit = parseLimit(req.query.limit);
    const items = repos.training.listDrillSentences(limit).map((sentence) => ({
      id: sentence.id,
      intent_ko: sentence.intent_ko,
      focus_ko: sentence.focus_ko,
      reference_en: sentence.reference_en,
      mastery_status: sentence.mastery_status,
    }));
    return { items, total_eligible: repos.training.countDrillEligible() };
  });

  app.post('/api/training/drill/results', async (req, reply) => {
    const { sentence_id, result, answer_text } = req.body ?? {};
    if (!Number.isInteger(sentence_id) || !RESULTS.includes(result) || typeof answer_text !== 'string' || !answer_text.trim()) {
      return reply.code(400).send({ error: 'sentence_id, result, answer_text가 필요합니다.' });
    }
    if (!repos.training.getSentence(sentence_id)) return reply.code(404).send({ error: 'not found' });
    return reply.code(201).send(repos.training.recordDrillResult({ sentence_id, result, answer_text: answer_text.trim() }));
  });
}
