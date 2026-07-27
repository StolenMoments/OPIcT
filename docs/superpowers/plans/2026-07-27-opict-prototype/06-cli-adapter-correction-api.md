# Task 06: CLI 어댑터·큐·관대한 파싱 + 교정 API

**Files:**
- Create: `server/src/ai/clis.js`, `server/src/ai/runner.js`, `server/src/ai/parse.js`, `server/src/ai/queue.js`, `server/src/ai/prompts.js`, `server/src/pipelines/correction.js`, `server/src/repo/corrections.js`, `server/src/routes/corrections.js`, `server/src/routes/meta.js`, `server/test/parse.test.js`, `server/test/corrections.test.js`, `server/test/fixtures/stub-cli.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`

**Interfaces:**
- Consumes: `app.repos`(01)
- Produces:
  - `CLIS` (`ai/clis.js`): `{ claude: {label, models: string[], argv(model): string[], extract(stdout): string}, codex: {...}, agy: {...} }` — 모델 목록의 단일 출처.
  - `runCli({cli, model, prompt, timeoutMs?}) → Promise<string>` (`ai/runner.js`) — stdout 원문 반환. 환경변수 `OPICT_CLI_STUB`가 있으면 어떤 cli든 `node $OPICT_CLI_STUB`를 실행(테스트용).
  - `lenientJson(text) → object | null` (`ai/parse.js`)
  - `enqueue(fn) → Promise` (`ai/queue.js`) — 서버 전역 직렬 큐. **평가 파이프라인(09)도 이 큐를 사용.**
  - `buildCorrectionPrompt(inputText) → string` (`ai/prompts.js`)
  - `runCorrection(repos, id)` (`pipelines/correction.js`) — 상태 전이 실행. **11의 재시도가 재사용.**
  - `repos.corrections`: `create({input_text,cli,model})`, `get(id)`, `list()`, `setStatus(id, fields)` (fields: `{status, result_json?, raw_output?, error_message?}`)
  - HTTP: `POST /api/corrections` body `{input_text, cli, model}` → `202 {id}`; `GET /api/corrections/:id`; `GET /api/corrections`; `GET /api/meta/clis` → `[{name,label,models}]`

- [ ] **Step 1: 파싱 실패 테스트** — `server/test/parse.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lenientJson } from '../src/ai/parse.js';

test('plain json', () => {
  assert.deepEqual(lenientJson('{"a":1}'), { a: 1 });
});
test('json in code fence', () => {
  assert.deepEqual(lenientJson('Here:\n```json\n{"a":1}\n```\ndone'), { a: 1 });
});
test('json with surrounding prose', () => {
  assert.deepEqual(lenientJson('Sure! {"a":{"b":2}} hope it helps'), { a: { b: 2 } });
});
test('no json returns null', () => {
  assert.equal(lenientJson('no json here'), null);
});
```

Run: `cd server && npm test` — Expected: FAIL (모듈 없음)

- [ ] **Step 2: parse/queue/clis/prompts 구현**

`server/src/ai/parse.js`:

```js
export function lenientJson(text) {
  if (typeof text !== 'string') return null;
  const candidates = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === 'object') return v;
    } catch { /* 다음 후보 */ }
  }
  return null;
}
```

`server/src/ai/queue.js`:

```js
let tail = Promise.resolve();
export function enqueue(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}
```

`server/src/ai/clis.js` — 모델 목록은 필요 시 여기만 수정:

```js
export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    argv: (model) => ['claude', '-p', '--model', model, '--output-format', 'json',
      '--disallowedTools', '*', '--no-session'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.2-codex', 'gpt-5.2', 'o5-mini'],
    argv: (model) => ['codex', 'exec', '-m', model, '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3-pro', 'gemini-3-flash'],
    argv: (model) => ['agy', '-p', '--model', model],
    extract: (stdout) => stdout,
  },
};
```

> 주의: 위 모델 ID·플래그는 구현 시점에 각 CLI의 `--help`로 실제 값을 확인해 갱신할 것(자주 바뀜). 이 파일만 고치면 되도록 설계되어 있다.

`server/src/ai/prompts.js`:

```js
export function buildCorrectionPrompt(inputText) {
  return [
    'You are an English writing coach for a Korean OPIc test taker.',
    'Correct the sentence below and suggest better alternatives.',
    'Respond with ONLY a JSON object, no prose, matching exactly:',
    '{"corrected": string, "alternatives": [{"text": string, "note_ko": string}], "explanation_ko": string}',
    '"explanation_ko" and "note_ko" must be written in Korean.',
    '',
    `Sentence: ${inputText}`,
  ].join('\n');
}
```

- [ ] **Step 3: runner 구현** — `server/src/ai/runner.js`

```js
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLIS } from './clis.js';

// CLI가 프로젝트 파일을 읽지 못하도록 빈 샌드박스 폴더에서 실행
const sandbox = join(tmpdir(), 'opict-sandbox');
mkdirSync(sandbox, { recursive: true });

export function runCli({ cli, model, prompt, timeoutMs = 180_000 }) {
  const def = CLIS[cli];
  if (!def) return Promise.reject(new Error(`알 수 없는 CLI: ${cli}`));
  const stub = process.env.OPICT_CLI_STUB;
  const [cmd, ...args] = stub ? [process.execPath, stub] : def.argv(model);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: sandbox, shell: !stub && process.platform === 'win32' });
    let out = '', err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI 타임아웃 (${timeoutMs / 1000}초)`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`CLI 종료코드 ${code}: ${err.slice(0, 500)}`));
      resolve(def.extract(out));
    });
    child.stdin.write(prompt);
    child.stdin.end(); // agy Windows hang 대응 — 반드시 즉시 닫기
  });
}
```

`server/test/fixtures/stub-cli.js` (stdin을 소비하고 고정 JSON 출력):

```js
process.stdin.resume();
process.stdin.on('end', () => {
  console.log(JSON.stringify({
    corrected: 'I have been jogging every morning for two years.',
    alternatives: [{ text: 'Jogging has been part of my morning routine for two years.', note_ko: '경험 강조' }],
    explanation_ko: '현재완료진행형이 자연스럽습니다.',
  }));
});
process.stdin.on('data', () => {});
```

- [ ] **Step 4: 교정 파이프라인 실패 테스트** — `server/test/corrections.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

async function waitDone(app, url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = (await app.inject({ url })).json();
    if (row.status === 'done' || row.status === 'error') return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for done');
}

test('correction pipeline with stub cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());

  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-fable-5' } });
  assert.equal(res.statusCode, 202);

  const row = await waitDone(app, `/api/corrections/${res.json().id}`);
  assert.equal(row.status, 'done');
  const result = JSON.parse(row.result_json);
  assert.ok(result.corrected.length > 0);
  assert.ok(row.raw_output.length > 0); // 원문 보존
});

test('unknown cli rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'x', cli: 'nope', model: 'm' } });
  assert.equal(res.statusCode, 400);
});
```

Run: `cd server && npm test` — Expected: FAIL

- [ ] **Step 5: repo·파이프라인·라우트 구현**

`server/src/repo/corrections.js`:

```js
export function correctionsRepo(db) {
  return {
    create({ input_text, cli, model }) {
      const info = db.prepare("INSERT INTO corrections (input_text,cli,model,status) VALUES (?,?,?,'pending')")
        .run(input_text, cli, model);
      return this.get(info.lastInsertRowid);
    },
    get(id) {
      return db.prepare('SELECT * FROM corrections WHERE id=?').get(id);
    },
    list() {
      return db.prepare('SELECT * FROM corrections ORDER BY id DESC').all();
    },
    setStatus(id, { status, result_json = null, raw_output = null, error_message = null }) {
      db.prepare('UPDATE corrections SET status=?, result_json=COALESCE(?,result_json), raw_output=COALESCE(?,raw_output), error_message=? WHERE id=?')
        .run(status, result_json, raw_output, error_message, id);
      return this.get(id);
    },
  };
}
```

`server/src/pipelines/correction.js`:

```js
import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildCorrectionPrompt } from '../ai/prompts.js';

export async function runCorrection(repos, id) {
  const row = repos.corrections.get(id);
  repos.corrections.setStatus(id, { status: 'running' });
  try {
    const raw = await runCli({ cli: row.cli, model: row.model, prompt: buildCorrectionPrompt(row.input_text) });
    const parsed = lenientJson(raw);
    if (!parsed) {
      repos.corrections.setStatus(id, { status: 'error', raw_output: raw, error_message: 'JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.corrections.setStatus(id, { status: 'done', result_json: JSON.stringify(parsed), raw_output: raw });
  } catch (e) {
    repos.corrections.setStatus(id, { status: 'error', error_message: `CLI 실행 실패: ${e.message}` });
  }
}
```

`server/src/routes/corrections.js`:

```js
import { CLIS } from '../ai/clis.js';
import { enqueue } from '../ai/queue.js';
import { runCorrection } from '../pipelines/correction.js';

export async function correctionsRoutes(app) {
  const repos = app.repos;

  app.post('/api/corrections', async (req, reply) => {
    const { input_text, cli, model } = req.body ?? {};
    if (!input_text?.trim() || !CLIS[cli] || !model)
      return reply.code(400).send({ error: 'input_text, cli(claude|codex|agy), model은 필수입니다' });
    const row = repos.corrections.create({ input_text: input_text.trim(), cli, model });
    enqueue(() => runCorrection(repos, row.id)); // 응답과 분리해 백그라운드 직렬 실행
    return reply.code(202).send({ id: row.id });
  });

  app.get('/api/corrections', async () => repos.corrections.list());
  app.get('/api/corrections/:id', async (req, reply) => {
    const row = repos.corrections.get(req.params.id);
    return row ?? reply.code(404).send({ error: 'not found' });
  });
}
```

`server/src/routes/meta.js`:

```js
import { CLIS } from '../ai/clis.js';

export async function metaRoutes(app) {
  app.get('/api/meta/clis', async () =>
    Object.entries(CLIS).map(([name, d]) => ({ name, label: d.label, models: d.models })));
}
```

`repo/index.js`에 `corrections: correctionsRepo(db)` 추가, `app.js`에 `correctionsRoutes`·`metaRoutes` 등록.

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS (parse 4 + corrections 2 포함)

- [ ] **Step 7: 커밋**

```bash
git add server/
git commit -m "feat(stage-06): add cli adapters, serial queue and correction api"
```

## 사용자 수동 검증

```bash
cd server && npm run dev
curl localhost:3000/api/meta/clis     # CLI 3종·모델 목록
# 실제 CLI 검증 (claude 로그인 상태 필요):
curl -X POST localhost:3000/api/corrections -H "content-type: application/json" ^
  -d "{\"input_text\":\"I am jogging since two years.\",\"cli\":\"claude\",\"model\":\"claude-fable-5\"}"
# → {"id":1} 반환 후:
curl localhost:3000/api/corrections/1  # status가 pending→running→done으로 변하고 result_json 채워짐
```
codex·agy도 같은 방식으로 1회씩 확인하고, 실패하면 `server/src/ai/clis.js`의 플래그·모델 ID를 해당 CLI `--help` 기준으로 수정한다(이 파일이 유일한 수정 지점).
