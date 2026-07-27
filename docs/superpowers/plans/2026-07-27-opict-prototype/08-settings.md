# Task 08: 설정 API + 기본 CLI/모델 설정 화면

**Files:**
- Create: `server/src/repo/settings.js`, `server/src/routes/settings.js`, `server/test/settings.test.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`, `server/src/routes/corrections.js`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/CorrectPage.tsx`, `web/src/components/CliPicker.tsx`

**Interfaces:**
- Consumes: `app.repos`(01), CliPicker(07)
- Produces:
  - `repos.settings`: `getAll() → Record<string,string>`, `set(entries: Record<string,string>)` (upsert)
  - `GET /api/settings` → `{default_cli?, default_model_claude?, default_model_codex?, default_model_agy?, whisper_model?}`
  - `PUT /api/settings` body 부분 객체 → 저장 후 전체 반환
  - **기본값 규약**: `POST /api/corrections`(및 09의 attempts)에서 `cli`/`model` 미지정 시 `default_cli`·`default_model_<cli>` 사용, 그것도 없으면 400. 프론트 CliPicker는 설정값을 초기 선택으로 사용.

- [ ] **Step 1: 실패하는 테스트** — `server/test/settings.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

test('settings upsert and read', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-sonnet-5' } });
  const res = await app.inject({ url: '/api/settings' });
  assert.equal(res.json().default_cli, 'claude');
});

test('correction falls back to default cli/model', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-sonnet-5' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 202);
  const row = (await app.inject({ url: `/api/corrections/${res.json().id}` })).json();
  assert.equal(row.cli, 'claude');
  assert.equal(row.model, 'claude-sonnet-5');
});

test('PUT /api/settings rejects unknown default_cli', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'nope' } });
  assert.equal(res.statusCode, 400);
});
```

Note: each CLI in `server/src/ai/clis.js` exposes exactly one model id (`claude → 'claude-sonnet-5'`, `codex → 'gpt-5.6-luna'`, `agy → 'gemini-3.6-flash'`); tests must use those ids or `POST /api/corrections`/`PUT /api/settings` will 400 on an unknown model.

Run: `cd server && npm test` — Expected: FAIL

- [ ] **Step 2: repo·라우트 구현**

`server/src/repo/settings.js`:

```js
export function settingsRepo(db) {
  return {
    getAll() {
      return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
    },
    set(entries) {
      const stmt = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [k, v] of Object.entries(entries)) stmt.run(k, String(v));
    },
  };
}
```

`server/src/routes/settings.js`:

```js
import { CLIS } from '../ai/clis.js';

export async function settingsRoutes(app) {
  app.get('/api/settings', async () => app.repos.settings.getAll());

  app.put('/api/settings', async (req, reply) => {
    const body = req.body ?? {};
    if (body.default_cli !== undefined && !CLIS[body.default_cli])
      return reply.code(400).send({ error: 'default_cli는 claude|codex|agy 중 하나여야 합니다' });
    for (const cli of Object.keys(CLIS)) {
      const key = `default_model_${cli}`;
      if (body[key] !== undefined && !CLIS[cli].models.includes(body[key]))
        return reply.code(400).send({ error: `${key}는 해당 cli의 지원 모델이어야 합니다` });
    }
    app.repos.settings.set(body);
    return app.repos.settings.getAll();
  });
}
```

`PUT /api/settings`는 `default_cli`/`default_model_<cli>` 키만 검증한다. 다른 키(예: 09에서 쓰는 `whisper_model`)는 그대로 통과시킨다(YAGNI — 그 키의 검증은 그 키를 도입하는 태스크의 책임).

`repo/index.js`에 `settings: settingsRepo(db)` 추가, `app.js`에 등록.

- [ ] **Step 3: corrections 기본값 폴백** — `server/src/routes/corrections.js`의 POST 핸들러 검증부를 교체:

```js
  app.post('/api/corrections', async (req, reply) => {
    const body = req.body ?? {};
    const s = repos.settings.getAll();
    const cli = body.cli ?? s.default_cli;
    const model = body.model ?? (CLIS[cli] ? s[`default_model_${cli}`] : undefined);
    if (!body.input_text?.trim() || !CLIS[cli] || !model || !CLIS[cli].models.includes(model))
      return reply.code(400).send({ error: 'input_text 필수, cli/model 미지정 시 설정의 기본값이 있어야 합니다' });
    const row = repos.corrections.create({ input_text: body.input_text.trim(), cli, model });
    enqueue(() => runCorrection(repos, row.id));
    return reply.code(202).send({ id: row.id });
  });
```

`cli`가 미지정이면 `undefined`가 될 수 있어, `CLIS[cli]`가 참일 때만 `s[\`default_model_${cli}\`]`를 조회한다 — 그렇지 않으면 `default_model_undefined`라는 무의미한 키를 찾게 되어 400 경로가 지저분해진다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS

- [ ] **Step 5: 설정 화면에 기본값 UI 추가** — `web/src/pages/SettingsPage.tsx` 상단에 섹션 추가

기존 "카테고리 관리" 위에 렌더. CliPicker를 재사용해 기본 CLI·모델을 고르고 [저장]. 기존 페이지의 `err`/`guard()`/`ErrorBanner` 패턴과 `section`/`section__row` 클래스, `Button` 프리미티브를 그대로 재사용한다 — 인라인 `style`은 쓰지 않는다:

```tsx
// SettingsPage 컴포넌트 안에 추가:
const [defCli, setDefCli] = useState('');
const [defModel, setDefModel] = useState('');
const [savedMsg, setSavedMsg] = useState('');
useEffect(() => {
  api<Record<string, string>>('/settings').then((s) => {
    if (s.default_cli) { setDefCli(s.default_cli); setDefModel(s[`default_model_${s.default_cli}`] ?? ''); }
  });
}, []);
const saveDefaults = () =>
  guard(async () => {
    await api('/settings', { method: 'PUT', body: JSON.stringify({ default_cli: defCli, [`default_model_${defCli}`]: defModel }) });
    setSavedMsg('저장됨 ✓');
    setTimeout(() => setSavedMsg(''), 2000);
  });

// JSX (return 최상단, ErrorBanner 다음, "카테고리 관리" 섹션 위에 추가):
<div className="section">
  <h2 className="section__title">기본 CLI·모델</h2>
  <div className="section__row">
    <CliPicker cli={defCli} model={defModel} onChange={(c, m) => { setDefCli(c); setDefModel(m); }} />
    <Button variant="primary" onClick={saveDefaults} disabled={!defCli || !defModel}>저장</Button>
    <span role="status" aria-live="polite">{savedMsg}</span>
  </div>
</div>
```

저장 피드백은 `role="status" aria-live="polite"`로 스크린리더에도 알린다(DESIGN.md의 비동기 상태 변화 규칙과 일치, `CorrectPage`의 "저장됨 ✓" 패턴과 동일).

(import에 `CliPicker` 추가)

- [ ] **Step 6: 교정 화면이 기본값을 초기 선택으로 사용** — `web/src/pages/CorrectPage.tsx`의 CliPicker 초기화 전, 마운트 시 설정 로드:

```tsx
useEffect(() => {
  api<Record<string, string>>('/settings').then((s) => {
    if (s.default_cli) { setCli(s.default_cli); setModel(s[`default_model_${s.default_cli}`] ?? ''); }
  });
}, []);
```

**주의(레이스):** 이 `/settings` fetch와 `CliPicker` 내부의 `/meta/clis` fetch는 순서 보장 없이 동시에 진행된다. 최초 구현은 `CliPicker`가 `props.cli`가 이미 있으면 첫 CLI로 덮어쓰지 않는다고 가정했지만, 그 체크가 mount 시점 클로저에 갇힌 `props.cli`(항상 빈 문자열)를 읽고 있어서 `/settings`가 먼저 응답해 기본값을 세팅해도 `/meta/clis`가 나중에 응답하면 "첫 CLI" 폴백이 저장된 기본값을 조용히 덮어쓰는 결함이 있었다(리뷰에서 발견, 수정 완료).

**수정된 동작** — `web/src/components/CliPicker.tsx`: `props.cli`를 매 렌더마다 미러링하는 ref(`cliRef`)를 두고, `/meta/clis` 응답이 도착한 "그 순간"의 최신 값을 그 ref로 읽는다. 자동 선택은 `autoSelectedRef`로 최대 한 번만 실행된다. 두 fetch 중 어느 쪽이 먼저 끝나든, 저장된 기본값이 있으면 항상 "첫 CLI" 폴백을 이긴다 — `/settings`가 먼저 응답하면 `cliRef.current`가 이미 채워져 있어 자동 선택이 스킵되고, `/meta/clis`가 먼저 응답해 자동 선택이 실행되더라도 뒤이어 `/settings`가 응답하면 부모의 `setCli`/`setDefCli`가 그 값을 덮어쓴다. `CliPicker`의 export 시그니처(`{ cli, model, onChange }`)는 변경하지 않았다(10번 태스크 의존).

```tsx
export default function CliPicker(props: { cli: string; model: string; onChange: (cli: string, model: string) => void }) {
  const [metas, setMetas] = useState<CliMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // props.cli 미러링 ref — /meta/clis 응답이 도착한 순간의 최신 값을 읽기 위함
  const cliRef = useRef(props.cli);
  cliRef.current = props.cli;
  const autoSelectedRef = useRef(false);

  useEffect(() => {
    api<CliMeta[]>('/meta/clis')
      .then((m) => {
        setMetas(m);
        setErr(null);
        if (!autoSelectedRef.current && !cliRef.current && m.length) {
          autoSelectedRef.current = true;
          props.onChange(m[0].name, m[0].models[0]);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ...select 렌더링은 이전과 동일
}
```

- [ ] **Step 7: 빌드·커밋**

Run: `cd web && npm run build` — Expected: 성공

```bash
git add server/ web/src/
git commit -m "feat(stage-08): add settings api with default cli/model fallback"
```

## 사용자 수동 검증

1. 설정 탭에서 기본 CLI/모델 저장 → 새로고침 후 유지.
2. 교정 탭 진입 시 기본값이 미리 선택되어 있음.
3. `curl -X POST localhost:3000/api/corrections -H "content-type: application/json" -d "{\"input_text\":\"He go to school.\"}"` → cli/model 없이도 202.
