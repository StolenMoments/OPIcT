# Task 11: 기록 화면 + 다시 시도 + 다시 듣기

**Files:**
- Create: `server/src/routes/retry.js`, `server/test/retry.test.js`, `web/src/pages/HistoryPage.css`
- Modify: `server/src/app.js`(라우트·오디오 서빙), `web/src/pages/HistoryPage.tsx`

**Interfaces:**
- Consumes: `repos.attempts`·`runAttempt`(09), `repos.corrections`·`runCorrection`·`enqueue`(06), `AttemptResult`(10), `usePolling`(07)
- Produces:
  - `POST /api/attempts/:id/retry` → `202 {id}` (같은 레코드 상태 리셋 후 파이프라인 재실행 — 새 레코드 없음, spec §7)
  - `POST /api/corrections/:id/retry` → `202 {id}` (동일)
  - `GET /api/attempts/:id/audio` → 저장된 webm 스트리밍 (`content-type: audio/webm`)

- [x] **Step 1: 실패하는 테스트** — `server/test/retry.test.js`

TDD RED 단계에서 교정 재시도 테스트를 먼저 추가하고 `cd server && npm test`를 실행했다. 라우트가 아직 등록되지 않아 새 테스트가 `404 !== 202`로 실패했다. 현재 allowlist에 없는 brief의 `claude-fable-5` 대신 실제 허용 모델 `claude-haiku-4-5-20251001`을 사용한다.

테스트는 다음 계약을 통합 검증한다.

```js
test('correction retry resets and reruns same record', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const { id } = (await app.inject({ method: 'POST', url: '/api/corrections',
    payload: { input_text: 'He go to school.', cli: 'claude', model: 'claude-haiku-4-5-20251001' } })).json();

  assert.equal((await waitDone(app, `/api/corrections/${id}`)).status, 'done');
  const retry = await app.inject({ method: 'POST', url: `/api/corrections/${id}/retry` });
  assert.equal(retry.statusCode, 202);
  assert.equal(retry.json().id, id);
  assert.equal((await waitDone(app, `/api/corrections/${id}`)).status, 'done');
  assert.equal((await app.inject({ url: '/api/corrections' })).json().length, 1);
});
```

추가로 평가 재시도와 `audio/webm` 스트리밍, 없는 레코드 및 파일의 정확한 `404 { error: 'not found' }` 봉투를 검증한다.

- [x] **Step 2: retry·오디오 라우트 구현** — `server/src/routes/retry.js`

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

`app.js`에 `retryRoutes`를 등록했다. SQL·DB 드라이버는 추가하지 않고 기존 repo·queue·pipeline 인터페이스만 사용한다.

- [x] **Step 3: 테스트 통과 확인**

`cd server && node --test test/retry.test.js` — 4/4 통과

`cd server && npm test` — 46/46 통과

- [x] **Step 4: 기록 화면** — `web/src/pages/HistoryPage.tsx`, `web/src/pages/HistoryPage.css`

평가/교정 서브탭은 `Button` 프리미티브와 `role="tab"`을 사용한다. 활성 탭만 `usePolling`하고, 행을 펼치면 평가에는 `AttemptResult`와 `<audio controls>`를, 교정에는 안전하게 파싱한 상세 결과를 표시한다. 모든 행의 [다시 시도]는 동일 ID의 retry API를 호출하고 loading/error 상태를 표시한다.

계획 예시의 인라인 스타일·기본 버튼·브라우저 다이얼로그는 `web/DESIGN.md`와 충돌하므로 실제 구현에서는 사용하지 않았다. 페이지 CSS는 기존 토큰(`--s-*`, `--t-*`, `--surface`, `--line`, `--ink-*`)과 row-list/UI 프리미티브만 사용한다.

```tsx
const attempts = usePolling<Attempt[]>(fetchAttempts, kind === 'attempts');
const corrections = usePolling<Correction[]>(fetchCorrections, kind === 'corrections');
const rows = kind === 'attempts' ? attempts : corrections;

{rows !== null && rows.length > 0 && (
  <ul className="row-list history-list">
    {rows.map((row) => (
      <HistoryRow
        key={row.id}
        row={row}
        open={openId === row.id}
        retrying={retryingId === row.id}
        onToggle={() => setOpenId(openId === row.id ? null : row.id)}
        onRetry={() => retry(
          kind === 'attempts' ? `/attempts/${row.id}/retry` : `/corrections/${row.id}/retry`,
          row.id,
        )}
      />
    ))}
  </ul>
)}
```

실제 화면에는 skeleton·empty state·error banner·malformed result 원문 보기·접근 가능한 펼침 행/오디오 라벨을 포함한다. `cd web && npm test`는 3/3 통과했고 `cd web && npm run build`도 성공했다.

- [x] **Step 5: 커밋**

```bash
git commit -m "feat(stage-11): add history screen with retry and audio playback"
```

구현 커밋 `63fc0dd` 뒤 리뷰 지적을 반영한 테스트 보강 커밋 `4f3db9f`를 추가했다.

## 사용자 수동 검증

기록 탭에서:
1. 평가 서브탭 — 이전 시도 목록, 펼치면 녹음 다시 듣기 + 결과. [다시 시도] 클릭 → 상태가 uploaded→…→done으로 다시 진행.
2. 교정 서브탭 — 동일하게 상세·재시도 확인.
3. error 상태 항목의 재시도가 정상 복구되는지 확인(예: whisper env 없이 실행해 STT 실패시킨 후 env 넣고 재시도).

자동 테스트는 실제 브라우저·마이크·whisper.cpp·ffmpeg·외부 CLI를 호출하지 않는다. 해당 실제 흐름은 사용자 수동 검증 범위다.
