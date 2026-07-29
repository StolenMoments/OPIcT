import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIS } from '../ai/clis.js';
import { enqueue } from '../ai/queue.js';
import { runAttempt } from '../pipelines/attempt.js';

// process.cwd()에 의존하지 않도록 모듈 위치 기준 절대 경로 사용
const uploadsDir = fileURLToPath(new URL('../../data/uploads', import.meta.url));

export async function attemptsRoutes(app) {
  const repos = app.repos;

  app.post('/api/attempts', async (req, reply) => {
    if (!req.isMultipart()) {
      const body = req.body ?? {};
      const scriptText = typeof body.script_text === 'string' ? body.script_text.trim() : '';
      const s = repos.settings.getAll();
      const cli = body.cli || s.default_cli;
      const model = body.model || (CLIS[cli] ? s[`default_model_${cli}`] : undefined);
      const question = body.question_id && repos.questions.get(body.question_id);
      if (!scriptText || !question || !CLIS[cli] || !model || !CLIS[cli].models.includes(model)) {
        return reply.code(400).send({ error: 'script_text, 유효한 question_id, cli/model(또는 기본값 설정)이 필요합니다' });
      }
      const row = repos.attempts.create({
        question_id: question.id, input_mode: 'text', transcript: scriptText, status: 'evaluating', cli, model,
      });
      enqueue(() => runAttempt(repos, row.id));
      return reply.code(202).send({ id: row.id });
    }

    const parts = req.parts();
    const fields = {};
    let audioPath = null;
    await mkdir(uploadsDir, { recursive: true });
    let truncated = false;
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'audio') {
        audioPath = join(uploadsDir, `${randomUUID()}.webm`);
        await pipeline(part.file, createWriteStream(audioPath));
        if (part.file.truncated) truncated = true;
      } else if (part.type === 'file') {
        // 예상치 못한 필드의 파일 파트 — 소비하지 않으면 busboy 이터레이터가 멈춘다.
        part.file.resume();
      } else if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      }
    }
    if (truncated) {
      if (audioPath) await unlink(audioPath).catch(() => {});
      return reply.code(400).send({ error: '업로드 파일이 허용 크기를 초과했습니다' });
    }
    const s = repos.settings.getAll();
    const cli = fields.cli || s.default_cli;
    const model = fields.model || (CLIS[cli] ? s[`default_model_${cli}`] : undefined);
    const question = fields.question_id && repos.questions.get(fields.question_id);
    if (!audioPath || !question || !CLIS[cli] || !model || !CLIS[cli].models.includes(model)) {
      if (audioPath) await unlink(audioPath).catch(() => {});
      return reply.code(400).send({ error: 'audio 파일, 유효한 question_id, cli/model(또는 기본값 설정)이 필요합니다' });
    }

    const row = repos.attempts.create({ question_id: question.id, audio_path: audioPath, cli, model });
    enqueue(() => runAttempt(repos, row.id));
    return reply.code(202).send({ id: row.id });
  });

  app.get('/api/attempts', async () => repos.attempts.list());
  app.get('/api/attempts/:id', async (req, reply) => {
    const row = repos.attempts.get(req.params.id);
    return row ?? reply.code(404).send({ error: 'not found' });
  });
}
