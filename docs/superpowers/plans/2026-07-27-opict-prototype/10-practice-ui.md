# Task 10: 연습 화면 — 녹음 → 업로드 → 폴링 → 결과

**Files:**
- Modify: `web/src/pages/PracticePage.tsx`, `web/src/types.ts`(Attempt 타입 추가), `web/src/api.ts`(FormData 바디 지원), `web/vite.config.ts`(vitest 설정), `web/package.json`(test 스크립트·devDependencies)
- Create: `web/src/hooks/useRecorder.ts`, `web/src/components/AttemptResult.tsx`, `web/src/components/AttemptResult.css`, `web/src/components/AttemptResult.test.tsx`, `web/src/pages/PracticePage.css`

**Interfaces:**
- Consumes: attempts API(09), `CategoryPicker`(04), `CliPicker`(07), `usePolling`(07), 설정 기본값(08)
- Produces:
  - `useRecorder(): { recording: boolean; start(): Promise<void>; stop(): Promise<Blob>; elapsedSec: number; error: string | null }` — MediaRecorder 래퍼(브리프의 `{ recording, start, stop }`을 상위집합으로 확장; 컨트롤러 결의 5).
  - `AttemptResult` — `{ row: Attempt }` props. status별 렌더(진행 시퀀스/에러+원문보기/결과, malformed JSON은 방어적으로 폴백). **기록 화면(11)이 재사용.**
  - `types.ts`에 추가: `Attempt = { id: number; question_id: number; question_text?: string; audio_path: string; transcript: string | null; cli: string; model: string; status: string; result_json: string | null; raw_output: string | null; error_message: string | null; created_at: string }`, `EvalResult = { summary_ko: string; strengths_ko: string[]; improvements_ko: string[]; recommended_expressions: { text: string; note_ko: string }[] }`

- [ ] **Step 1: 타입 추가** — 위 두 타입을 `web/src/types.ts`에 추가.

- [ ] **Step 2: useRecorder** — `web/src/hooks/useRecorder.ts`

실제 구현은 브리프의 초안을 다음과 같이 강화했다(컨트롤러 결의 5):
권한 거부/미지원을 일반 `Error`로 노출(`error` 필드), `stop()`을 녹음 중이 아닐 때 호출해도 안전하게 처리, 언마운트 시 트랙 정리, `MediaRecorder.isTypeSupported`로 지원 mime 타입 선택(webm/opus 우선, 폴백 체인), 경과 시간(`elapsedSec`) 추가. 반환 shape은 `{ recording, start, stop, elapsedSec, error }` — 브리프의 `{ recording, start, stop }`을 상위집합으로 유지.

```ts
import { useEffect, useRef, useState } from 'react';

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return CANDIDATE_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const mimeType = useRef<string>('audio/webm');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timer.current != null) { clearInterval(timer.current); timer.current = null; }
  };

  useEffect(() => {
    return () => {
      stopTimer();
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(null);
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('이 브라우저에서는 녹음을 지원하지 않습니다.');
      throw new Error('MediaRecorder not supported');
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('마이크 사용 권한이 필요합니다.');
      throw new Error('microphone permission denied');
    }
    const supported = pickMimeType();
    mimeType.current = supported ?? 'audio/webm';
    chunks.current = [];
    try {
      rec.current = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError('녹음을 시작할 수 없습니다.');
      throw new Error('MediaRecorder construction failed');
    }
    rec.current.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    rec.current.start();
    setRecording(true);
    setElapsedSec(0);
    timer.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  };

  const stop = (): Promise<Blob> => {
    stopTimer();
    const active = rec.current;
    if (!active || active.state === 'inactive') {
      setRecording(false);
      return Promise.resolve(new Blob(chunks.current, { type: mimeType.current }));
    }
    return new Promise<Blob>((resolve) => {
      active.onstop = () => {
        active.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(new Blob(chunks.current, { type: mimeType.current }));
      };
      active.stop();
    });
  };

  return { recording, start, stop, elapsedSec, error };
}
```

- [ ] **Step 3: AttemptResult** — `web/src/components/AttemptResult.tsx`

브리프의 초안과 달리(컨트롤러 결의 2, 4): 인라인 `style`을 디자인 시스템 컴포넌트(`ErrorBanner`, `StatusPill`, `.section`/`.row-list`)로 교체하고, `JSON.parse`를 `safeParseResult`로 감싸 실패 시 "결과를 표시할 수 없습니다" + 원문 보기로 폴백한다(크래시 불가). 진행 상태는 `uploaded → transcribing → evaluating` 3단계를 `StatusPill` 시퀀스로 렌더링하고 `aria-live="polite"`로 감싼다. (리뷰 finding 4 수정) `PIPELINE[].label`을 실제로 각 pill 옆에 렌더해 세 pill이 어느 단계인지 구분되게 한다 — 이전 구현은 `label`을 정의만 하고 쓰지 않아 세 pill이 서로 구분 불가능했다.

```tsx
import ErrorBanner from './ui/ErrorBanner';
import StatusPill from './ui/StatusPill';
import type { Attempt, EvalResult } from '../types';
import './AttemptResult.css';

const PIPELINE = [
  { key: 'uploaded', label: '업로드' },
  { key: 'transcribing', label: '전사' },
  { key: 'evaluating', label: '평가' },
] as const;

const STATUS_KO: Record<string, string> = {
  uploaded: '대기 중', transcribing: '전사 중', evaluating: '평가 중',
};

function safeParseResult(json: string | null): EvalResult | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<EvalResult>;
    if (
      typeof parsed.summary_ko !== 'string' ||
      !Array.isArray(parsed.strengths_ko) ||
      !Array.isArray(parsed.improvements_ko) ||
      !Array.isArray(parsed.recommended_expressions)
    ) return null;
    return parsed as EvalResult;
  } catch {
    return null;
  }
}

function pillStatusFor(rowStatus: string, stageKey: string): 'pending' | 'running' | 'done' {
  const stageIdx = PIPELINE.findIndex((p) => p.key === stageKey);
  const rowIdx = PIPELINE.findIndex((p) => p.key === rowStatus);
  if (rowStatus === 'done' || rowIdx > stageIdx) return 'done';
  if (rowIdx === stageIdx) return 'running';
  return 'pending';
}

export default function AttemptResult({ row }: { row: Attempt }) {
  if (row.status === 'error') {
    return (
      <div className="section" aria-live="polite">
        <ErrorBanner message={row.error_message ?? '평가 중 오류가 발생했습니다.'} />
        {row.raw_output && <details className="raw-output"><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
      </div>
    );
  }

  if (row.status !== 'done') {
    return (
      <div className="attempt-pipeline" aria-live="polite">
        {PIPELINE.map((stage) => (
          <span key={stage.key} className="attempt-pipeline__stage">
            <span className="attempt-pipeline__stage-label">{stage.label}</span>
            <StatusPill status={pillStatusFor(row.status, stage.key)} />
          </span>
        ))}
        <span className="attempt-pipeline__label">{STATUS_KO[row.status] ?? row.status}…</span>
      </div>
    );
  }

  const result = safeParseResult(row.result_json);
  if (!result) {
    return (
      <div className="section" aria-live="polite">
        <ErrorBanner message="결과를 표시할 수 없습니다." />
        {row.raw_output && <details className="raw-output"><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
      </div>
    );
  }

  return (
    <div className="section" aria-live="polite">
      {row.transcript && (<div><h3>내 답변 (전사)</h3><p>{row.transcript}</p></div>)}
      <div><h3>총평</h3><p>{result.summary_ko}</p></div>
      <div><h3>잘한 점</h3><ul className="row-list">{result.strengths_ko.map((s, i) => (
        <li key={i} className="row-list__item"><span className="row-list__text">{s}</span></li>
      ))}</ul></div>
      <div><h3>개선점</h3><ul className="row-list">{result.improvements_ko.map((s, i) => (
        <li key={i} className="row-list__item"><span className="row-list__text">{s}</span></li>
      ))}</ul></div>
      <div><h3>추천 표현</h3><ul className="row-list">{result.recommended_expressions.map((e, i) => (
        <li key={i} className="row-list__item">
          <div className="row-list__main">
            <span className="row-list__text">{e.text}</span>
            <span className="row-list__meta">{e.note_ko}</span>
          </div>
        </li>
      ))}</ul></div>
    </div>
  );
}
```

- [ ] **Step 4: 연습 화면** — `web/src/pages/PracticePage.tsx` 전체 교체

흐름: CategoryPicker → 문항 목록 → 문항 선택 → 질문 표시 + CliPicker(설정 기본값 프리로드) + 녹음 시작/정지 → 정지 시 자동 업로드(`POST /api/attempts` FormData, `api()` 경유) → usePolling(CorrectPage와 동일한 `row?.id === attemptId` 게이트 + status 기반 `active`) → AttemptResult.

브리프 대비 변경(컨트롤러 결의 1·2·3, + 리뷰 findings 2·3): raw `fetch` 대신 `api()`(FormData 지원하도록 `api.ts` 수정, 아래 참고)를 사용하고, `alert()` 대신 `err`/`guard()`/`ErrorBanner` 패턴을 쓰며, 폴링은 `attemptId`가 settled 되면 멈추고 이전 attempt 행을 절대 렌더하지 않는다. 디자인 시스템 준수를 위해 인라인 style을 전부 걷어내고 `Button`/`ErrorBanner`/`EmptyState`/`Skeleton`/`CategoryPicker`/`CliPicker`/`AttemptResult`와 `PracticePage.css`(문항 텍스트, 녹음 버튼, 앰버 탤리 램프 pulse, 경과 시간)로 대체했다. 빈 상태 3종(카테고리 미선택, 문항 없음, 아직 시도 없음)을 추가했다.

리뷰에서 지적된 두 결함(findings 2·3)을 고쳤다: `handleFinish`는 클릭 시점의 `question_id`를 `questionId` 지역 변수로 고정해 업로드 바디에 쓰고, 업로드 성공 콜백은 `qRef`(매 렌더마다 `q`를 미러링하는 ref — 클로저로 캡처한 `q`는 await 이후 갱신되지 않으므로)와 비교해 사용자가 그 사이 다른 문항으로 넘어갔으면 `setAttemptId`/`setActive`를 호출하지 않는다. `submitting` 플래그를 추가해 `handleFinish` 전체 구간 동안 녹음 시작(`busy`에 포함)·녹음 종료·제출(`disabled`+`loading`)·← 문항 목록을 모두 잠가, 업로드 도중 새 녹음을 시작하거나 문항을 바꿔 두 시도가 동시에 진행되는 경로를 막는다.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import CliPicker from '../components/CliPicker';
import AttemptResult from '../components/AttemptResult';
import Button from '../components/ui/Button';
import ErrorBanner from '../components/ui/ErrorBanner';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useRecorder } from '../hooks/useRecorder';
import { usePolling } from '../hooks/usePolling';
import type { Attempt, Question } from '../types';
import './PracticePage.css';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PracticePage() {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try { await fn(); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, []);

  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [cli, setCli] = useState('');
  const [model, setModel] = useState('');
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { recording, start, stop, elapsedSec, error: recorderError } = useRecorder();

  // handleFinish의 async 클로저가 캡처한 q는 await 이후 갱신되지 않으므로,
  // ref로 매 렌더의 최신 q를 미러링해 업로드 완료 시점의 "지금" 문항과 비교한다.
  const qRef = useRef<Question | null>(q);
  qRef.current = q;

  useEffect(() => {
    api<Record<string, string>>('/settings').then((s) => {
      if (s.default_cli) { setCli(s.default_cli); setModel(s[`default_model_${s.default_cli}`] ?? ''); }
    });
  }, []);

  const loadQs = useCallback(() => {
    if (!catId) { setQuestions(null); return; }
    setQuestions(null);
    api<Question[]>(`/questions?category_id=${catId}`)
      .then((qs) => { setQuestions(qs); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [catId]);
  useEffect(() => { setQ(null); loadQs(); }, [loadQs]);

  const rawRow = usePolling<Attempt>(() => api<Attempt>(`/attempts/${attemptId}`), active);
  const row = rawRow?.id === attemptId ? rawRow : null; // 이전 attempt 데이터가 새 attempt에 렌더되는 것 방지

  useEffect(() => {
    if (row && (row.status === 'done' || row.status === 'error')) setActive(false);
  }, [row]);

  const settled = row?.status === 'done' || row?.status === 'error';
  const busy = submitting || (attemptId != null && !settled);

  const selectQuestion = (question: Question) => {
    setQ(question); setAttemptId(null); setActive(false); setErr(null);
  };

  const handleStart = () => guard(() => start());

  const handleFinish = () => {
    const questionId = q!.id; // 클릭 시점에 고정 — 업로드 바디와 완료 후 비교 모두 이 값을 쓴다
    setSubmitting(true);
    return guard(async () => {
      try {
        const blob = await stop();
        const form = new FormData();
        form.append('audio', blob, 'answer.webm');
        form.append('question_id', String(questionId));
        if (cli) { form.append('cli', cli); form.append('model', model); }
        const { id } = await api<{ id: number }>('/attempts', { method: 'POST', body: form });
        if (qRef.current?.id === questionId) { // 그 사이 다른 문항으로 넘어갔으면 무시
          setAttemptId(id);
          setActive(true);
        }
      } finally {
        setSubmitting(false);
      }
    });
  };

  if (!q) {
    return (
      <div className="page">
        <h2>연습</h2>
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
        <div className="section">
          <CategoryPicker value={catId} onChange={setCatId} />
          {catId == null && <EmptyState message="카테고리를 선택하면 문항이 표시됩니다." />}
          {catId != null && questions === null && <Skeleton rows={3} />}
          {catId != null && questions !== null && questions.length === 0 && (
            <EmptyState message="이 카테고리에 문항이 없습니다. 설정 탭에서 문항을 추가해 보세요." />
          )}
          {catId != null && questions !== null && questions.length > 0 && (
            <ul className="row-list">
              {questions.map((it) => (
                <li key={it.id} className="row-list__item">
                  <button type="button" className="practice-question-pick" onClick={() => selectQuestion(it)}>
                    <span className="row-list__text">{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Button variant="ghost" size="sm" onClick={() => setQ(null)} disabled={recording || submitting}>← 문항 목록</Button>
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
      {recorderError && <ErrorBanner message={recorderError} />}

      <div className="section">
        <p className="practice-question">{q.text}</p>
        {q.note && <p className="practice-question__hint">힌트: {q.note}</p>}
      </div>

      <div className="section">
        <div className="section__row">
          <CliPicker cli={cli} model={model} onChange={(c, m) => { setCli(c); setModel(m); }} />
        </div>
        <div className="practice-record">
          {!recording ? (
            <Button className="practice-record__btn" variant="primary" onClick={handleStart} disabled={busy}>
              녹음 시작
            </Button>
          ) : (
            <>
              <span className="practice-record__live" aria-hidden="true"><span className="practice-record__tally" /></span>
              <span className="practice-record__elapsed" role="status" aria-live="polite">녹음 중 {formatElapsed(elapsedSec)}</span>
              <Button className="practice-record__btn" variant="primary" onClick={handleFinish} disabled={submitting} loading={submitting}>
                녹음 종료·제출
              </Button>
            </>
          )}
        </div>
      </div>

      {row && <div className="section"><AttemptResult row={row} /></div>}
      {!row && (attemptId != null || submitting) && <Skeleton rows={2} />}
      {!row && attemptId == null && !recording && !submitting && (
        <EmptyState message="아직 녹음한 답변이 없습니다. 녹음 시작을 눌러 답변해 보세요." />
      )}
    </div>
  );
}
```

**`web/src/api.ts` 수정 (컨트롤러 결의 1)** — `FormData` 바디일 때는 JSON `content-type`을 강제하지 않아 브라우저가 multipart boundary를 직접 설정하게 한다:

```ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isFormData ? init?.headers : { 'content-type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? res.statusText);
  return body as T;
}
```

- [ ] **Step 5: 핵심 전이 화면 테스트 1개 (AGENTS.md: 화면은 핵심 전이만)**

```bash
cd web && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`web/package.json` scripts에 `"test": "vitest run"` 추가. `web/src/components/AttemptResult.test.tsx` — 브리프의 두 테스트에 malformed `result_json` 폴백(컨트롤러 결의 4) 테스트 하나를 추가했다. `@testing-library/jest-dom`은 vitest 전용 진입점(`@testing-library/jest-dom/vitest`)으로 임포트해야 전역 `expect`가 아닌 vitest의 `expect`에 매처가 등록된다:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AttemptResult from './AttemptResult';
import type { Attempt } from '../types';

const base = { id: 1, question_id: 1, audio_path: 'x', cli: 'claude', model: 'm', created_at: '', raw_output: null } as Partial<Attempt>;

describe('AttemptResult', () => {
  it('shows progress while evaluating', () => {
    render(<AttemptResult row={{ ...base, status: 'evaluating', transcript: 't', result_json: null, error_message: null } as Attempt} />);
    expect(screen.getByText(/평가 중/)).toBeTruthy();
  });
  it('renders feedback when done', () => {
    const result_json = JSON.stringify({ summary_ko: '좋음', strengths_ko: ['a'], improvements_ko: ['b'], recommended_expressions: [{ text: 'x', note_ko: 'y' }] });
    render(<AttemptResult row={{ ...base, status: 'done', transcript: 't', result_json, error_message: null } as Attempt} />);
    expect(screen.getByText('좋음')).toBeTruthy();
  });
  it('falls back to an error message when result_json is malformed', () => {
    render(<AttemptResult row={{ ...base, status: 'done', transcript: 't', result_json: '{not json', error_message: null } as Attempt} />);
    expect(screen.getByText(/결과를 표시할 수 없습니다/)).toBeTruthy();
  });
});
```

`web/vite.config.ts`에 vitest 설정 추가:

```ts
// defineConfig 객체에:
test: { environment: 'jsdom' },
```

(파일 상단을 `import { defineConfig } from 'vitest/config';`로 교체)

Run: `cd web && npm test` — Expected: PASS 3. `npm run build`도 성공.

- [ ] **Step 6: 커밋**

```bash
git add web/
git commit -m "feat(stage-10): add practice screen with recording and evaluation flow"
```

## 사용자 수동 검증

서버(whisper env 포함)·웹 기동 → 연습 탭:
1. 카테고리 → 문항 선택 → 녹음 시작(마이크 권한 허용) → 10초쯤 영어로 답변 → 종료·제출.
2. "전사 중 → 평가 중" 진행 후 전사문·총평·잘한 점·개선점·추천 표현 표시.
3. 다른 CLI를 골라 한 번 더 — 모델별 결과 비교.
