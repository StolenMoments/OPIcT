# Task 09: STT(ffmpeg+whisper.cpp) + 녹음 평가 API

**Files:**
- Create: `server/src/stt/whisper.js`, `server/src/pipelines/attempt.js`, `server/src/repo/attempts.js`, `server/src/routes/attempts.js`, `server/test/attempts.test.js`, `server/test/fixtures/stub-stt.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`(multipart 등록 + 라우트), `server/src/ai/prompts.js`(평가 프롬프트 추가), `.env.example`(생성)

**Interfaces:**
- Consumes: `runCli`·`enqueue`·`lenientJson`(06), `repos.settings`(08), `repos.questions`(02)
- Produces:
  - `transcribe(audioPath: string) → Promise<string>` (`stt/whisper.js`) — webm→wav 변환 후 whisper 실행. env `OPICT_STT_STUB`가 있으면 `node $OPICT_STT_STUB <audioPath>` 실행(테스트용).
  - `buildEvalPrompt(questionText, transcript) → string`
  - `runAttempt(repos, id)` (`pipelines/attempt.js`) — **11의 재시도가 재사용.**
  - `repos.attempts`: `create({question_id,audio_path,cli,model})`, `get(id)`, `list()`(question text 조인 포함), `setStatus(id, {status, transcript?, result_json?, raw_output?, error_message?})`
  - HTTP: `POST /api/attempts` (multipart: `audio` 파일 + `question_id`·`cli`·`model` 필드, cli/model은 08 기본값 폴백) → `202 {id}`; `GET /api/attempts/:id`; `GET /api/attempts`
  - 평가 result_json 형태: `{"summary_ko": string, "strengths_ko": string[], "improvements_ko": string[], "recommended_expressions": [{"text": string, "note_ko": string}]}`
  - 필요 env(`.env.example`에 기록): `OPICT_WHISPER_BIN`(whisper-cli 실행 파일 경로), `OPICT_WHISPER_MODEL`(ggml 모델 파일 경로), ffmpeg은 PATH 가정.

- [ ] **Step 1: 실패하는 테스트** — `server/test/attempts.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));
process.env.OPICT_STT_STUB = fileURLToPath(new URL('./fixtures/stub-stt.js', import.meta.url));

async function waitDone(app, url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = (await app.inject({ url })).json();
    if (row.status === 'done' || row.status === 'error') return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout');
}

test('attempt pipeline: upload → transcribe → evaluate → done', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Tell me about your jogging routine.' } })).json();

  const form = new FormData();
  form.append('audio', new Blob([Buffer.from('fake-webm')], { type: 'audio/webm' }), 'a.webm');
  form.append('question_id', String(q.id));
  form.append('cli', 'claude');
  form.append('model', 'claude-fable-5');
  const res = await app.inject({ method: 'POST', url: '/api/attempts', body: form });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/attempts/${res.json().id}`);
  assert.equal(row.status, 'done');
  assert.ok(row.transcript.length > 0);
  assert.ok(JSON.parse(row.result_json));
});
```

> 참고: `app.inject`는 undici `FormData`/`Blob`(Node 22 내장)을 multipart body로 지원한다.

`server/test/fixtures/stub-stt.js`:

```js
console.log('I jog every morning near the river and it makes me feel refreshed.');
```

또한 `server/test/fixtures/stub-cli.js`의 출력이 교정 형태뿐이므로, 평가 키도 함께 내도록 **stub-cli.js를 두 형태 겸용으로 교체**:

```js
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({
    corrected: 'I have been jogging every morning for two years.',
    alternatives: [{ text: 'Jogging has been part of my morning routine.', note_ko: '경험 강조' }],
    explanation_ko: '현재완료진행형이 자연스럽습니다.',
    summary_ko: '과제를 충실히 수행했습니다.',
    strengths_ko: ['일관된 시제'],
    improvements_ko: ['디테일 추가'],
    recommended_expressions: [{ text: 'clear my head', note_ko: '머리를 식히다' }],
  }));
});
process.stdin.on('data', () => {});
```

Run: `cd server && npm test` — Expected: attempts만 FAIL (기존은 PASS 유지)

- [ ] **Step 2: whisper 어댑터** — `server/src/stt/whisper.js`

```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const run = promisify(execFile);

export async function transcribe(audioPath) {
  if (process.env.OPICT_STT_STUB) {
    const { stdout } = await run(process.execPath, [process.env.OPICT_STT_STUB, audioPath]);
    return stdout.trim();
  }
  const bin = process.env.OPICT_WHISPER_BIN;
  const model = process.env.OPICT_WHISPER_MODEL;
  if (!bin || !model) throw new Error('OPICT_WHISPER_BIN / OPICT_WHISPER_MODEL 환경변수가 필요합니다');

  const wav = `${audioPath}.wav`;
  await run('ffmpeg', ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', wav]);
  await run(bin, ['-m', model, '-f', wav, '-l', 'en', '-otxt', '-of', wav], { timeout: 180_000 });
  return (await readFile(`${wav}.txt`, 'utf8')).trim();
}
```

- [ ] **Step 3: 평가 프롬프트** — `server/src/ai/prompts.js`에 추가

```js
export function buildEvalPrompt(questionText, transcript) {
  return [
    'You are an OPIc rater coaching a Korean test taker.',
    'Evaluate the transcribed answer against the question: task fulfillment, organization, vocabulary and grammar.',
    'Respond with ONLY a JSON object, no prose, matching exactly:',
    '{"summary_ko": string, "strengths_ko": [string], "improvements_ko": [string], "recommended_expressions": [{"text": string, "note_ko": string}]}',
    'All *_ko fields must be written in Korean.',
    '',
    `Question: ${questionText}`,
    `Transcribed answer: ${transcript}`,
  ].join('\n');
}
```

- [ ] **Step 4: repo·파이프라인·라우트 구현**

`server/src/repo/attempts.js`:

```js
export function attemptsRepo(db) {
  return {
    create({ question_id, audio_path, cli, model }) {
      const info = db.prepare("INSERT INTO attempts (question_id,audio_path,cli,model,status) VALUES (?,?,?,?,'uploaded')")
        .run(question_id, audio_path, cli, model);
      return this.get(info.lastInsertRowid);
    },
    get(id) {
      return db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
    },
    list() {
      return db.prepare(
        'SELECT a.*, q.text AS question_text FROM attempts a JOIN questions q ON q.id=a.question_id ORDER BY a.id DESC'
      ).all();
    },
    setStatus(id, { status, transcript = null, result_json = null, raw_output = null, error_message = null }) {
      db.prepare(`UPDATE attempts SET status=?, transcript=COALESCE(?,transcript),
        result_json=COALESCE(?,result_json), raw_output=COALESCE(?,raw_output), error_message=? WHERE id=?`)
        .run(status, transcript, result_json, raw_output, error_message, id);
      return this.get(id);
    },
  };
}
```

`server/src/pipelines/attempt.js`:

```js
import { transcribe } from '../stt/whisper.js';
import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildEvalPrompt } from '../ai/prompts.js';

export async function runAttempt(repos, id) {
  const row = repos.attempts.get(id);
  try {
    repos.attempts.setStatus(id, { status: 'transcribing' });
    const transcript = await transcribe(row.audio_path).catch((e) => {
      throw new Error(`STT 실패: ${e.message}`);
    });
    repos.attempts.setStatus(id, { status: 'evaluating', transcript });

    const question = repos.questions.get(row.question_id);
    const raw = await runCli({ cli: row.cli, model: row.model, prompt: buildEvalPrompt(question.text, transcript) })
      .catch((e) => { throw new Error(`CLI 실행 실패: ${e.message}`); });
    const parsed = lenientJson(raw);
    if (!parsed) {
      repos.attempts.setStatus(id, { status: 'error', raw_output: raw, error_message: 'JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.attempts.setStatus(id, { status: 'done', result_json: JSON.stringify(parsed), raw_output: raw });
  } catch (e) {
    repos.attempts.setStatus(id, { status: 'error', error_message: e.message });
  }
}
```

`server/src/routes/attempts.js`:

```js
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { CLIS } from '../ai/clis.js';
import { enqueue } from '../ai/queue.js';
import { runAttempt } from '../pipelines/attempt.js';

export async function attemptsRoutes(app) {
  const repos = app.repos;

  app.post('/api/attempts', async (req, reply) => {
    const parts = req.parts();
    const fields = {};
    let audioPath = null;
    await mkdir('data/uploads', { recursive: true });
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'audio') {
        audioPath = join('data/uploads', `${randomUUID()}.webm`);
        await pipeline(part.file, createWriteStream(audioPath));
      } else if (part.type === 'field') {
        fields[part.fieldname] = part.value;
      }
    }
    const s = repos.settings.getAll();
    const cli = fields.cli || s.default_cli;
    const model = fields.model || s[`default_model_${cli}`];
    const question = fields.question_id && repos.questions.get(fields.question_id);
    if (!audioPath || !question || !CLIS[cli] || !model)
      return reply.code(400).send({ error: 'audio 파일, 유효한 question_id, cli/model(또는 기본값 설정)이 필요합니다' });

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
```

`server/src/app.js`에 multipart 등록(정적 서빙 등록보다 위):

```js
import fastifyMultipart from '@fastify/multipart';
await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });
```

`repo/index.js`에 `attempts: attemptsRepo(db)` 추가, `attemptsRoutes` 등록.

`.env.example` (루트):

```
# whisper.cpp 실행 파일과 ggml 모델 경로
OPICT_WHISPER_BIN=C:/tools/whisper.cpp/whisper-cli.exe
OPICT_WHISPER_MODEL=C:/tools/whisper.cpp/ggml-base.en.bin
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS 전부

- [ ] **Step 6: whisper.cpp 로컬 설치 (수동, 문서화만)**

Windows: whisper.cpp release에서 바이너리 다운로드, `ggml-base.en.bin` 모델 다운로드, ffmpeg는 `winget install ffmpeg`. 경로를 `.env` 대신 시스템 환경변수 또는 `npm run dev` 전에 설정. OCI(ARM Linux)에서는 소스 빌드(`cmake -B build && cmake --build build`).

- [ ] **Step 7: 커밋**

```bash
git add server/ .env.example
git commit -m "feat(stage-09): add whisper stt and attempt evaluation pipeline"
```

## 사용자 수동 검증

```bash
# 환경변수 설정 후 서버 기동 (PowerShell 예)
$env:OPICT_WHISPER_BIN="C:\tools\whisper.cpp\whisper-cli.exe"
$env:OPICT_WHISPER_MODEL="C:\tools\whisper.cpp\ggml-base.en.bin"
cd server; npm run dev

# 짧은 영어 음성 파일(sample.webm 또는 mp3)로:
curl -X POST localhost:3000/api/attempts -F "audio=@sample.webm" -F "question_id=1"
curl localhost:3000/api/attempts/1   # transcribing→evaluating→done, transcript·result_json 확인
```
