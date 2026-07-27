# Task 06: CLI 어댑터·큐·관대한 파싱 + 교정 API

**Files:**
- Create: `server/src/ai/clis.js`, `server/src/ai/runner.js`, `server/src/ai/parse.js`, `server/src/ai/queue.js`, `server/src/ai/prompts.js`, `server/src/pipelines/correction.js`, `server/src/repo/corrections.js`, `server/src/routes/corrections.js`, `server/src/routes/meta.js`, `server/test/parse.test.js`, `server/test/corrections.test.js`, `server/test/fixtures/stub-cli.js`, `server/test/fixtures/stub-cli-bad-json.js`, `server/test/fixtures/stub-cli-fail.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`

**Interfaces:**
- Consumes: `app.repos`(01)
- Produces:
  - `CLIS` (`ai/clis.js`): `{ claude: {label, models: string[], promptMode: 'stdin'|'argv', bin(): string[], argv(model, prompt?): string[], extract(stdout): string}, codex: {...}, agy: {...} }` — 모델 목록·플래그·실행 파일 경로의 단일 출처. `bin()`은 실행 파일 후보를 우선순위대로 주고, runner가 처음 존재하는 것을 쓴다(.cmd 래퍼보다 .exe 우선). `promptMode`가 `'argv'`면 프롬프트를 stdin이 아니라 인자로 넘긴다(agy).
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

`server/src/ai/clis.js` — 모델 목록은 필요 시 여기만 수정 (각 CLI당 모델 1개, 배열 형태 유지):

```js
import { homedir } from 'node:os';
import { join } from 'node:path';

// CLI 어댑터 테이블 — 모델 ID·플래그·실행 파일 경로가 바뀌면 이 파일만 고친다.
//
// bin(): 실행 파일 후보를 우선순위대로. runner가 처음 존재하는 것을 쓰고, 없으면 마지막 값을 그대로 쓴다.
//   .cmd 배치 래퍼는 exit code·stdin 전달이 어긋나므로 .exe 를 먼저 찾는다(drillup에서 검증된 방식).
// promptMode:
//   'stdin' — 프롬프트를 stdin으로 넘기고 즉시 닫는다(agy Windows hang 대응).
//   'argv'  — 프롬프트를 인자로 넘긴다. 셸을 거치지 않으므로 따옴표·개행이 원문 그대로 전달된다.
// argv(): 실행 파일 뒤에 붙는 인자만. 명령 자체는 bin()이 정한다.

const win = process.platform === 'win32';
const home = () => homedir();
const localAppData = () => process.env.LOCALAPPDATA ?? join(home(), 'AppData', 'Local');
const npmModules = () => join(home(), 'AppData', 'Roaming', 'npm', 'node_modules');
const codexVendor = (triple, arch) =>
  join(npmModules(), '@openai', 'codex', 'node_modules', '@openai',
    `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe');

export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-haiku-4-5-20251001'],
    promptMode: 'stdin',
    bin: () => win
      ? [join(home(), '.local', 'bin', 'claude.exe'),
         join(npmModules(), '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
         'claude.cmd']
      : [join(home(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', 'claude'],
    argv: (model) => ['--model', model, '--effort', 'low', '--output-format', 'json',
      '--disallowedTools', '*', '-p'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.6-luna'],
    promptMode: 'stdin',
    bin: () => win
      ? [codexVendor('x86_64-pc-windows-msvc', 'x64'),
         codexVendor('aarch64-pc-windows-msvc', 'arm64'),
         'codex.cmd']
      : [join(home(), '.local', 'bin', 'codex'), '/usr/local/bin/codex', 'codex'],
    // -c 값의 따옴표는 codex의 TOML 파서가 요구한다. 셸을 거치지 않아야 그대로 도착한다.
    argv: (model) => ['exec', '--model', model, '-c', 'model_reasoning_effort="low"',
      '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3.6-flash'],
    promptMode: 'argv',
    bin: () => win
      ? [join(localAppData(), 'agy', 'bin', 'agy.exe'),
         join(home(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
         'agy.exe']
      : [join(home(), '.local', 'bin', 'agy'), '/usr/local/bin/agy', 'agy'],
    argv: (model, prompt) => ['-p', prompt, '--model', model, '--effort', 'low'],
    extract: (stdout) => stdout,
  },
};
```

> 위 모델 ID·플래그·실행 파일 경로는 2026-07-27 세 CLI 실제 호출로 확인했다(claude/codex/agy 모두 교정 JSON 정상 수신). 값이 바뀌면 이 파일만 고치면 된다.

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
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLIS } from './clis.js';

// CLI가 프로젝트 파일을 읽지 못하도록 빈 샌드박스 폴더에서 실행
const sandbox = join(tmpdir(), 'opict-sandbox');
mkdirSync(sandbox, { recursive: true });

const resolved = new Map();

// 존재하는 첫 후보를 고른다. 하나도 없으면 마지막 후보(이름만)를 PATH 탐색에 맡긴다.
function resolveBin(cli, def) {
  if (!resolved.has(cli)) {
    const candidates = def.bin();
    resolved.set(cli, candidates.find(existsSync) ?? candidates.at(-1));
  }
  return resolved.get(cli);
}

/**
 * 실제로 spawn할 명령·인자·옵션을 만든다. 테스트에서 조립 결과만 검증할 수 있도록 분리.
 */
export function buildInvocation({ cli, model, prompt, stub }) {
  if (stub) {
    // 테스트 스텁은 항상 stdin으로 프롬프트를 받는다.
    return { cmd: process.execPath, args: [stub], opts: {}, stdinPrompt: prompt };
  }
  const def = CLIS[cli];
  const cmd = resolveBin(cli, def);
  // 셸은 .cmd/.bat 래퍼로 떨어졌을 때만. 셸을 거치면 인자가 따옴표 없이 이어붙어
  // 프롬프트의 따옴표·개행에서 인자 경계가 깨지고, 프롬프트 내용이 명령줄로 새어나간다.
  const opts = { shell: /\.(cmd|bat)$/i.test(cmd), windowsHide: true };

  return def.promptMode === 'argv'
    ? { cmd, args: def.argv(model, prompt), opts, stdinPrompt: null }
    : { cmd, args: def.argv(model), opts, stdinPrompt: prompt };
}

export function runCli({ cli, model, prompt, timeoutMs = 180_000 }) {
  const def = CLIS[cli];
  if (!def) return Promise.reject(new Error(`알 수 없는 CLI: ${cli}`));
  const { cmd, args, opts, stdinPrompt } = buildInvocation({
    cli, model, prompt, stub: process.env.OPICT_CLI_STUB,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: sandbox, ...opts });
    let out = '', err = '', settled = false;
    const settleResolve = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const settleReject = (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } };
    const timer = setTimeout(() => {
      child.kill();
      const e = new Error(`CLI 타임아웃 (${timeoutMs / 1000}초)`);
      e.rawOutput = out;
      settleReject(e);
    }, timeoutMs);
    // 한글 응답이 청크 경계에서 잘리지 않도록 스트림 단위로 디코딩한다.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (cause) => {
      const e = new Error(`CLI 실행 파일을 실행할 수 없습니다 (${cmd}): ${cause.message}`, { cause });
      e.rawOutput = out;
      settleReject(e);
    });
    child.stdin.on('error', () => { /* EPIPE 등 — close/error 핸들러가 최종 처리 */ });
    child.on('close', (code) => {
      if (code !== 0) {
        const e = new Error(`CLI 종료코드 ${code}: ${err.slice(0, 500)}`);
        e.rawOutput = out;
        return settleReject(e);
      }
      settleResolve(def.extract(out));
    });
    if (stdinPrompt !== null) child.stdin.write(stdinPrompt, 'utf-8');
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
    payload: { input_text: 'I am jogging since two years.', cli: 'claude', model: 'claude-haiku-4-5-20251001' } });
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

> 리뷰 수정 라운드에서 추가된 회귀 테스트(같은 파일, `server/test/fixtures/stub-cli-bad-json.js` / `stub-cli-fail.js` 픽스처 사용):
> - `model` 화이트리스트 밖 값(`cli:'claude', model:'not-a-real-model; rm -rf /'`) → `400`.
> - CLI가 파싱 불가능한 stdout을 낸 경우 → `status:'error'`이면서 `raw_output`이 보존됨.
> - CLI가 stdout을 쓴 뒤 0이 아닌 코드로 종료한 경우 → `status:'error'`이면서 그 stdout이 `raw_output`에 보존됨.
>
> `OPICT_CLI_STUB`은 `runCli` 호출 시점에 읽히므로, 각 테스트가 `process.env.OPICT_CLI_STUB`을 해당 픽스처로 바꿨다가 `finally`에서 기본 스텁으로 복원하는 방식으로 케이스별 스텁을 전환한다.

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
    // e.rawOutput은 runCli가 실패 직전까지의 stdout을 실어보낸 것 — 있으면 반드시 보존한다.
    repos.corrections.setStatus(id, {
      status: 'error',
      raw_output: e.rawOutput || null,
      error_message: `CLI 실행 실패: ${e.message}`,
    });
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
    // model은 해당 cli의 CLIS[cli].models 화이트리스트에 있는 값만 허용 —
    // Windows에서 셸/명령줄을 거쳐 spawn되는 argv에 그대로 흘러들어가므로 임의 문자열 통과 금지.
    if (!input_text?.trim() || !CLIS[cli] || !model || !CLIS[cli].models.includes(model))
      return reply.code(400).send({ error: 'input_text, cli(claude|codex|agy), model(해당 cli의 지원 모델)은 필수입니다' });
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

Run: `cd server && npm test` — Expected: PASS (parse 4 + corrections 5 포함: 원래 2 + 리뷰 수정 라운드에서 추가된 화이트리스트·raw_output 보존 회귀 테스트 3)

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
  -d "{\"input_text\":\"I am jogging since two years.\",\"cli\":\"claude\",\"model\":\"claude-haiku-4-5-20251001\"}"
# → {"id":1} 반환 후:
curl localhost:3000/api/corrections/1  # status가 pending→running→done으로 변하고 result_json 채워짐
```
codex·agy도 같은 방식으로 1회씩 확인하고, 실패하면 `server/src/ai/clis.js`의 플래그·모델 ID를 해당 CLI `--help` 기준으로 수정한다(이 파일이 유일한 수정 지점).
