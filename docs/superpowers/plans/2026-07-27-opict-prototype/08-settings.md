# Task 08: 설정 API + 기본 CLI/모델 설정 화면

**Files:**
- Create: `server/src/repo/settings.js`, `server/src/routes/settings.js`, `server/test/settings.test.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`, `server/src/routes/corrections.js`, `web/src/pages/SettingsPage.tsx`, `web/src/pages/CorrectPage.tsx`

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
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-fable-5' } });
  const res = await app.inject({ url: '/api/settings' });
  assert.equal(res.json().default_cli, 'claude');
});

test('correction falls back to default cli/model', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  await app.inject({ method: 'PUT', url: '/api/settings', payload: { default_cli: 'claude', default_model_claude: 'claude-fable-5' } });
  const res = await app.inject({ method: 'POST', url: '/api/corrections', payload: { input_text: 'hello' } });
  assert.equal(res.statusCode, 202);
  const row = (await app.inject({ url: `/api/corrections/${res.json().id}` })).json();
  assert.equal(row.cli, 'claude');
  assert.equal(row.model, 'claude-fable-5');
});
```

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
export async function settingsRoutes(app) {
  app.get('/api/settings', async () => app.repos.settings.getAll());
  app.put('/api/settings', async (req) => {
    app.repos.settings.set(req.body ?? {});
    return app.repos.settings.getAll();
  });
}
```

`repo/index.js`에 `settings: settingsRepo(db)` 추가, `app.js`에 등록.

- [ ] **Step 3: corrections 기본값 폴백** — `server/src/routes/corrections.js`의 POST 핸들러 검증부를 교체:

```js
  app.post('/api/corrections', async (req, reply) => {
    const body = req.body ?? {};
    const s = repos.settings.getAll();
    const cli = body.cli ?? s.default_cli;
    const model = body.model ?? s[`default_model_${cli}`];
    if (!body.input_text?.trim() || !CLIS[cli] || !model)
      return reply.code(400).send({ error: 'input_text 필수, cli/model 미지정 시 설정의 기본값이 있어야 합니다' });
    const row = repos.corrections.create({ input_text: body.input_text.trim(), cli, model });
    enqueue(() => runCorrection(repos, row.id));
    return reply.code(202).send({ id: row.id });
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS

- [ ] **Step 5: 설정 화면에 기본값 UI 추가** — `web/src/pages/SettingsPage.tsx` 상단에 섹션 추가

기존 "카테고리 관리" 위에 렌더. CliPicker를 재사용해 기본 CLI·모델을 고르고 [저장]:

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
const saveDefaults = async () => {
  await api('/settings', { method: 'PUT', body: JSON.stringify({ default_cli: defCli, [`default_model_${defCli}`]: defModel }) });
  setSavedMsg('저장됨 ✓'); setTimeout(() => setSavedMsg(''), 2000);
};

// JSX (return 최상단에 추가):
<h2>기본 CLI·모델</h2>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <CliPicker cli={defCli} model={defModel} onChange={(c, m) => { setDefCli(c); setDefModel(m); }} />
  <button onClick={saveDefaults}>저장</button> <span>{savedMsg}</span>
</div>
```

(import에 `CliPicker` 추가)

- [ ] **Step 6: 교정 화면이 기본값을 초기 선택으로 사용** — `web/src/pages/CorrectPage.tsx`의 CliPicker 초기화 전, 마운트 시 설정 로드:

```tsx
useEffect(() => {
  api<Record<string, string>>('/settings').then((s) => {
    if (s.default_cli) { setCli(s.default_cli); setModel(s[`default_model_${s.default_cli}`] ?? ''); }
  });
}, []);
```

(CliPicker는 `props.cli`가 이미 있으면 첫 CLI로 덮어쓰지 않으므로 그대로 동작)

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
