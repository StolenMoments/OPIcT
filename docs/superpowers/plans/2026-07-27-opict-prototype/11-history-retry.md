# Task 11: 기록 화면 + 다시 시도 + 다시 듣기

**Files:**
- Create: `server/src/routes/retry.js`, `server/test/retry.test.js`
- Modify: `server/src/app.js`(라우트·오디오 서빙), `web/src/pages/HistoryPage.tsx`

**Interfaces:**
- Consumes: `repos.attempts`·`runAttempt`(09), `repos.corrections`·`runCorrection`·`enqueue`(06), `AttemptResult`(10), `usePolling`(07)
- Produces:
  - `POST /api/attempts/:id/retry` → `202 {id}` (같은 레코드 상태 리셋 후 파이프라인 재실행 — 새 레코드 없음, spec §7)
  - `POST /api/corrections/:id/retry` → `202 {id}` (동일)
  - `GET /api/attempts/:id/audio` → 저장된 webm 스트리밍 (`content-type: audio/webm`)

- [ ] **Step 1: 실패하는 테스트** — `server/test/retry.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';

process.env.OPICT_CLI_STUB = fileURLToPath(new URL('./fixtures/stub-cli.js', import.meta.url));

test('correction retry resets and reruns same record', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const { id } = (await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'He go to school.', cli: 'claude', model: 'claude-fable-5' } })).json();

  // done까지 대기
  while ((await app.inject({ url: `/api/corrections/${id}` })).json().status !== 'done')
    await new Promise((r) => setTimeout(r, 50));

  const retry = await app.inject({ method: 'POST', url: `/api/corrections/${id}/retry` });
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.json().id, id); // 새 레코드 아님

  while ((await app.inject({ url: `/api/corrections/${id}` })).json().status !== 'done')
    await new Promise((r) => setTimeout(r, 50));
  assert.equal((await app.inject({ url: '/api/corrections' })).json().length, 1);
});
```

Run: `cd server && npm test` — Expected: FAIL (404)

- [ ] **Step 2: retry·오디오 라우트 구현** — `server/src/routes/retry.js`

```js
import { createReadStream, existsSync } from 'node:fs';
import { enqueue } from '../ai/queue.js';
import { runAttempt } from '../pipelines/attempt.js';
import { runCorrection } from '../pipelines/correction.js';

export async function retryRoutes(app) {
  const repos = app.repos;

  app.post('/api/attempts/:id/retry', async (req, reply) => {
    const row = repos.attempts.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    repos.attempts.setStatus(row.id, { status: 'uploaded', error_message: null });
    enqueue(() => runAttempt(repos, row.id));
    return reply.code(202).send({ id: row.id });
  });

  app.post('/api/corrections/:id/retry', async (req, reply) => {
    const row = repos.corrections.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    repos.corrections.setStatus(row.id, { status: 'pending', error_message: null });
    enqueue(() => runCorrection(repos, row.id));
    return reply.code(202).send({ id: row.id });
  });

  app.get('/api/attempts/:id/audio', async (req, reply) => {
    const row = repos.attempts.get(req.params.id);
    if (!row || !existsSync(row.audio_path)) return reply.code(404).send({ error: 'not found' });
    return reply.type('audio/webm').send(createReadStream(row.audio_path));
  });
}
```

`app.js`에 `retryRoutes` 등록.

- [ ] **Step 3: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS

- [ ] **Step 4: 기록 화면** — `web/src/pages/HistoryPage.tsx` 전체 교체

평가/교정 2개 서브탭. 목록에서 항목 펼치면(AttemptResult 재사용) 상세 + [다시 시도] + 평가엔 `<audio controls src={/api/attempts/:id/audio}>`.

```tsx
import { useState } from 'react';
import { api } from '../api';
import AttemptResult from '../components/AttemptResult';
import { usePolling } from '../hooks/usePolling';
import type { Attempt, Correction, CorrectionResult } from '../types';

function CorrectionDetail({ row }: { row: Correction }) {
  if (row.status === 'error')
    return (
      <div style={{ color: 'crimson' }}>
        <p>{row.error_message}</p>
        {row.raw_output && <details><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
      </div>
    );
  if (row.status !== 'done') return <p>{row.status}…</p>;
  const r: CorrectionResult = JSON.parse(row.result_json!);
  return (
    <div>
      <p><strong>교정문:</strong> {r.corrected}</p>
      <ul>{r.alternatives.map((a, i) => <li key={i}>{a.text} — <small>{a.note_ko}</small></li>)}</ul>
      <p>{r.explanation_ko}</p>
    </div>
  );
}

export default function HistoryPage() {
  const [kind, setKind] = useState<'attempts' | 'corrections'>('attempts');
  const [openId, setOpenId] = useState<number | null>(null);
  // 목록은 2초 폴링 — 재시도 후 상태 변화가 자동 반영됨
  const attempts = usePolling<Attempt[]>(() => api('/attempts'), kind === 'attempts') ?? [];
  const corrections = usePolling<Correction[]>(() => api('/corrections'), kind === 'corrections') ?? [];

  const retry = async (path: string) => { await api(path, { method: 'POST' }); };

  return (
    <div>
      <h2>기록</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setKind('attempts')} style={{ fontWeight: kind === 'attempts' ? 700 : 400 }}>평가</button>
        <button onClick={() => setKind('corrections')} style={{ fontWeight: kind === 'corrections' ? 700 : 400 }}>교정</button>
      </div>

      {kind === 'attempts' && (
        <ul>
          {attempts.map((a) => (
            <li key={a.id} style={{ marginBottom: 8 }}>
              <button onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                [{a.status}] {a.question_text} <small>({a.cli}/{a.model}, {a.created_at})</small>
              </button>
              {openId === a.id && (
                <div style={{ borderLeft: '3px solid #ccc', paddingLeft: 8 }}>
                  <audio controls src={`/api/attempts/${a.id}/audio`} />
                  <AttemptResult row={a} />
                  <button onClick={() => retry(`/attempts/${a.id}/retry`)}>다시 시도</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {kind === 'corrections' && (
        <ul>
          {corrections.map((c) => (
            <li key={c.id} style={{ marginBottom: 8 }}>
              <button onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                [{c.status}] {c.input_text.slice(0, 40)} <small>({c.cli}/{c.model}, {c.created_at})</small>
              </button>
              {openId === c.id && (
                <div style={{ borderLeft: '3px solid #ccc', paddingLeft: 8 }}>
                  <CorrectionDetail row={c} />
                  <button onClick={() => retry(`/corrections/${c.id}/retry`)}>다시 시도</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

Run: `cd web && npm run build` — Expected: 성공

- [ ] **Step 5: 커밋**

```bash
git add server/ web/src/
git commit -m "feat(stage-11): add history screen with retry and audio playback"
```

## 사용자 수동 검증

기록 탭에서:
1. 평가 서브탭 — 이전 시도 목록, 펼치면 녹음 다시 듣기 + 결과. [다시 시도] 클릭 → 상태가 uploaded→…→done으로 다시 진행.
2. 교정 서브탭 — 동일하게 상세·재시도 확인.
3. error 상태 항목의 재시도가 정상 복구되는지 확인(예: whisper env 없이 실행해 STT 실패시킨 후 env 넣고 재시도).
