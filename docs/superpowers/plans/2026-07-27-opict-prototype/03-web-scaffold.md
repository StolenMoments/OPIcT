# Task 03: 웹 스캐폴드 + 탭 네비게이션 + 서버 연결 표시

**Files:**
- Create: `web/` (Vite React TS 프로젝트), `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/{PracticePage,CorrectPage,NotesPage,HistoryPage,SettingsPage}.tsx`, `web/vite.config.ts`(프록시)
- Modify: `server/src/app.js` (빌드 결과 정적 서빙)

**Interfaces:**
- Consumes: `GET /api/health` (Task 01)
- Produces:
  - `api<T>(path: string, init?: RequestInit): Promise<T>` — `web/src/api.ts`. JSON fetch 헬퍼, 비 2xx면 `Error(body.error ?? statusText)` throw. **이후 모든 화면 작업이 이것만 사용.**
  - `App.tsx` 하단 탭 5개: 연습/교정/노트/기록/설정 — 각 페이지 컴포넌트는 props 없는 default export. 이후 작업은 각 페이지 파일만 교체한다.
  - 서버가 `web/dist`를 정적 서빙(SPA fallback: 미매칭 GET → `index.html`)

- [ ] **Step 1: Vite 프로젝트 생성**

```bash
npm create vite@latest web -- --template react-ts
cd web && npm i
```

`web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
```

- [ ] **Step 2: api 헬퍼** — `web/src/api.ts`

```ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}
```

- [ ] **Step 3: 탭 셸과 빈 페이지 5개**

`web/src/pages/PracticePage.tsx` (나머지 4개도 이름만 바꿔 동일 형태):

```tsx
export default function PracticePage() {
  return <p>연습 화면 (Task 10에서 구현)</p>;
}
```

`web/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from './api';
import PracticePage from './pages/PracticePage';
import CorrectPage from './pages/CorrectPage';
import NotesPage from './pages/NotesPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  { key: 'practice', label: '연습', el: <PracticePage /> },
  { key: 'correct', label: '교정', el: <CorrectPage /> },
  { key: 'notes', label: '노트', el: <NotesPage /> },
  { key: 'history', label: '기록', el: <HistoryPage /> },
  { key: 'settings', label: '설정', el: <SettingsPage /> },
] as const;

export default function App() {
  const [tab, setTab] = useState<string>('practice');
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ ok: boolean }>('/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false));
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 64 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: 12 }}>
        <strong>OPIcT</strong>
        <span>{online == null ? '…' : online ? '서버 연결됨' : '서버 연결 안 됨'}</span>
      </header>
      <main style={{ padding: 12 }}>{TABS.find((t) => t.key === tab)!.el}</main>
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', borderTop: '1px solid #ccc', background: 'inherit' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ flex: 1, padding: 12, fontWeight: t.key === tab ? 700 : 400 }}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
```

`web/src/main.tsx`는 Vite 기본 유지(불필요한 `App.css`/로고 관련 코드는 삭제), `index.html`의 `<title>`을 `OPIcT`로.

- [ ] **Step 4: 서버 정적 서빙** — `server/src/app.js`의 buildApp에 추가

```js
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) =>
    req.method === 'GET' && !req.url.startsWith('/api')
      ? reply.sendFile('index.html')
      : reply.code(404).send({ error: 'not found' }));
}
```

- [ ] **Step 5: 검증 (자동 테스트 없음 — 화면 전이는 핵심 아님, AGENTS.md 기준)**

Run: `cd web && npm run build` → 에러 없이 dist 생성.
Run: `cd server && npm test` → 기존 테스트 여전히 PASS.

- [ ] **Step 6: 커밋**

```bash
git add web/ server/src/app.js
git commit -m "feat(stage-03): scaffold react pwa shell with tab navigation"
```

## 사용자 수동 검증

```bash
cd server && npm run dev     # 터미널 1
cd web && npm run dev        # 터미널 2 → http://localhost:5173
```
- 상단에 "서버 연결됨" 표시, 하단 탭 5개 전환 동작.
- (선택) `cd web && npm run build` 후 http://localhost:3000 접속 → 서버 단독으로 같은 화면.
