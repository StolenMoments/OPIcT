import { CLIS } from '../ai/clis.js';
import { enqueue } from '../ai/queue.js';
import { runTrainingAnswer, runTrainingSession } from '../pipelines/training.js';

function parseVerdict(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeAnswer(row) {
  const answer = {
    id: row.id,
    session_item_id: row.session_item_id,
    attempt_no: row.attempt_no,
    answer_text: row.answer_text,
    status: row.status,
    error_message: row.error_message,
    created_at: row.created_at,
  };
  if (row.status === 'done') {
    const verdict = parseVerdict(row.verdict_json);
    if (verdict) {
      const hintAllowed = row.attempt_no === 1 && verdict.passes === false;
      answer.verdict = hintAllowed ? verdict : { ...verdict, hint_ko: undefined };
    }
  }
  if (row.item_status === 'completed') answer.reference_en = row.reference_en;
  return answer;
}

function serializeSession(repos, session) {
  const items = repos.training.listSessionItems(session.id).map((item) => {
    const result = {
      id: item.id,
      sentence_id: item.sentence_id,
      position: item.position,
      status: item.status,
      outcome: item.outcome,
      source_type: item.source_type,
      source_id: item.source_id,
      source_sentence: item.source_sentence,
      intent_ko: item.intent_ko,
      focus_ko: item.focus_ko,
      mastery_status: item.mastery_status,
      is_variation: item.parent_id != null,
      variation_kind: item.variation_kind,
      answers: repos.training.listItemAnswers(item.id).map((answer) => serializeAnswer({
        ...answer,
        item_status: item.status,
        reference_en: item.reference_en,
      })),
    };
    if (item.status === 'completed') result.reference_en = item.reference_en;
    return result;
  });
  const response = {
    id: session.id,
    status: session.status,
    error_code: session.error_code,
    error_message: session.error_message,
    created_at: session.created_at,
    completed_at: session.completed_at,
    items,
  };
  if (session.status === 'completed') {
    const summary = repos.training.summary(session.id);
    response.summary = {
      first_try_pass: summary.first_try_pass ?? 0,
      hint_pass: summary.hint_pass ?? 0,
      review: summary.review ?? 0,
    };
  }
  return response;
}

export async function trainingRoutes(app) {
  const repos = app.repos;

  app.post('/api/training/sessions', async (_req, reply) => {
    const active = repos.training.findActiveSession();
    if (active) {
      return reply.code(409).send({
        error: '진행 중인 문장 훈련이 있습니다.',
        code: 'ACTIVE_TRAINING_SESSION',
        session_id: active.id,
      });
    }
    const settings = repos.settings.getAll();
    const cli = settings.default_cli;
    const model = CLIS[cli] ? settings[`default_model_${cli}`] : undefined;
    if (!CLIS[cli] || !model || !CLIS[cli].models.includes(model)) {
      return reply.code(400).send({
        error: '문장 훈련에 사용할 기본 CLI와 모델을 설정해 주세요.',
        code: 'TRAINING_SETTINGS_REQUIRED',
      });
    }
    const session = repos.training.createSession({ cli, model });
    enqueue(() => runTrainingSession(repos, session.id, app.now));
    return reply.code(202).send({ id: session.id });
  });

  app.get('/api/training/sessions/:id', async (req, reply) => {
    const session = repos.training.getSession(req.params.id);
    return session
      ? serializeSession(repos, session)
      : reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/training/items/:id/answers', async (req, reply) => {
    const item = repos.training.getItem(req.params.id);
    if (!item) return reply.code(404).send({ error: 'not found' });
    const answerText = typeof req.body?.answer_text === 'string' ? req.body.answer_text.trim() : '';
    if (!answerText) return reply.code(400).send({ error: 'answer_text가 필요합니다.' });
    const currentItem = repos.training.getCurrentItem(item.session_id);
    const attemptNo = currentItem?.id === item.id
      ? item.status === 'pending' ? 1 : item.status === 'awaiting_revision' ? 2 : null
      : null;
    if (!attemptNo) {
      return reply.code(409).send({
        error: '현재 문제 상태에서는 답안을 제출할 수 없습니다.',
        code: 'INVALID_TRAINING_TRANSITION',
      });
    }
    const answer = repos.training.createAnswer(item.id, answerText, attemptNo);
    enqueue(() => runTrainingAnswer(repos, answer.id, app.now));
    return reply.code(202).send({ id: answer.id });
  });

  app.get('/api/training/answers/:id', async (req, reply) => {
    const answer = repos.training.getAnswer(req.params.id);
    return answer ? serializeAnswer(answer) : reply.code(404).send({ error: 'not found' });
  });

  app.post('/api/training/answers/:id/retry', async (req, reply) => {
    const answer = repos.training.getAnswer(req.params.id);
    if (!answer) return reply.code(404).send({ error: 'not found' });
    if (answer.status !== 'error') {
      return reply.code(409).send({
        error: '실패한 답안만 다시 시도할 수 있습니다.',
        code: 'INVALID_TRAINING_TRANSITION',
      });
    }
    repos.training.retryAnswer(answer.id);
    enqueue(() => runTrainingAnswer(repos, answer.id, app.now));
    return reply.code(202).send({ id: answer.id });
  });
}
