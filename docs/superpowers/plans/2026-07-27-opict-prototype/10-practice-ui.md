# Task 10: 연습 화면 — 녹음 → 업로드 → 폴링 → 결과

**Files:**
- Modify: `web/src/pages/PracticePage.tsx`, `web/src/types.ts`(Attempt 타입 추가)
- Create: `web/src/hooks/useRecorder.ts`, `web/src/components/AttemptResult.tsx`

**Interfaces:**
- Consumes: attempts API(09), `CategoryPicker`(04), `CliPicker`(07), `usePolling`(07), 설정 기본값(08)
- Produces:
  - `useRecorder(): { recording: boolean; start(): Promise<void>; stop(): Promise<Blob> }` — MediaRecorder(webm/opus) 래퍼.
  - `AttemptResult` — `{ row: Attempt }` props. status별 렌더(진행/에러+원문보기/결과). **기록 화면(11)이 재사용.**
  - `types.ts`에 추가: `Attempt = { id: number; question_id: number; question_text?: string; audio_path: string; transcript: string | null; cli: string; model: string; status: string; result_json: string | null; raw_output: string | null; error_message: string | null; created_at: string }`, `EvalResult = { summary_ko: string; strengths_ko: string[]; improvements_ko: string[]; recommended_expressions: { text: string; note_ko: string }[] }`

- [ ] **Step 1: 타입 추가** — 위 두 타입을 `web/src/types.ts`에 추가.

- [ ] **Step 2: useRecorder** — `web/src/hooks/useRecorder.ts`

```ts
import { useRef, useState } from 'react';

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    rec.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    rec.current.ondataavailable = (e) => chunks.current.push(e.data);
    rec.current.start();
    setRecording(true);
  };

  const stop = () =>
    new Promise<Blob>((resolve) => {
      rec.current!.onstop = () => {
        rec.current!.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(new Blob(chunks.current, { type: 'audio/webm' }));
      };
      rec.current!.stop();
    });

  return { recording, start, stop };
}
```

- [ ] **Step 3: AttemptResult** — `web/src/components/AttemptResult.tsx`

```tsx
import type { Attempt, EvalResult } from '../types';

const STATUS_KO: Record<string, string> = {
  uploaded: '대기 중', transcribing: '전사 중', evaluating: '평가 중',
};

export default function AttemptResult({ row }: { row: Attempt }) {
  if (row.status === 'error')
    return (
      <div style={{ color: 'crimson' }}>
        <p>{row.error_message}</p>
        {row.raw_output && <details><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
      </div>
    );
  if (row.status !== 'done') return <p>{STATUS_KO[row.status] ?? row.status}…</p>;

  const r: EvalResult = JSON.parse(row.result_json!);
  return (
    <div>
      {row.transcript && (<><h3>내 답변 (전사)</h3><p>{row.transcript}</p></>)}
      <h3>총평</h3><p>{r.summary_ko}</p>
      <h3>잘한 점</h3><ul>{r.strengths_ko.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>개선점</h3><ul>{r.improvements_ko.map((s, i) => <li key={i}>{s}</li>)}</ul>
      <h3>추천 표현</h3>
      <ul>{r.recommended_expressions.map((e, i) => <li key={i}>{e.text} — <small>{e.note_ko}</small></li>)}</ul>
    </div>
  );
}
```

- [ ] **Step 4: 연습 화면** — `web/src/pages/PracticePage.tsx` 전체 교체

흐름: CategoryPicker → 문항 목록 → 문항 선택 → 질문 표시 + CliPicker(설정 기본값 프리로드) + 녹음 시작/정지 → 정지 시 자동 업로드(`POST /api/attempts` FormData) → usePolling → AttemptResult.

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import CliPicker from '../components/CliPicker';
import AttemptResult from '../components/AttemptResult';
import { useRecorder } from '../hooks/useRecorder';
import { usePolling } from '../hooks/usePolling';
import type { Attempt, Question } from '../types';

export default function PracticePage() {
  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [q, setQ] = useState<Question | null>(null);
  const [cli, setCli] = useState('');
  const [model, setModel] = useState('');
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const { recording, start, stop } = useRecorder();

  useEffect(() => {
    api<Record<string, string>>('/settings').then((s) => {
      if (s.default_cli) { setCli(s.default_cli); setModel(s[`default_model_${s.default_cli}`] ?? ''); }
    });
  }, []);

  const loadQs = useCallback(() => {
    if (catId) api<Question[]>(`/questions?category_id=${catId}`).then(setQuestions);
  }, [catId]);
  useEffect(() => { setQ(null); loadQs(); }, [loadQs]);

  const row = usePolling<Attempt>(() => api(`/attempts/${attemptId}`), attemptId != null);
  const busy = attemptId != null && row?.status !== 'done' && row?.status !== 'error';

  const finish = async () => {
    const blob = await stop();
    const form = new FormData();
    form.append('audio', blob, 'answer.webm');
    form.append('question_id', String(q!.id));
    if (cli) { form.append('cli', cli); form.append('model', model); }
    const res = await fetch('/api/attempts', { method: 'POST', body: form });
    const body = await res.json();
    if (!res.ok) { alert(body.error); return; }
    setAttemptId(body.id);
  };

  if (!q)
    return (
      <div>
        <h2>연습</h2>
        <CategoryPicker value={catId} onChange={setCatId} />
        <ul>
          {questions.map((it) => (
            <li key={it.id} style={{ marginBottom: 8 }}>
              <button onClick={() => { setQ(it); setAttemptId(null); }}>{it.text}</button>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div>
      <button onClick={() => setQ(null)}>← 문항 목록</button>
      <h2>질문</h2>
      <p style={{ fontSize: 18 }}>{q.text}</p>
      {q.note && <p><small>힌트: {q.note}</small></p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <CliPicker cli={cli} model={model} onChange={(c, m) => { setCli(c); setModel(m); }} />
        {!recording
          ? <button onClick={start} disabled={busy}>● 녹음 시작</button>
          : <button onClick={finish}>■ 녹음 종료·제출</button>}
      </div>
      {row && <AttemptResult row={row} />}
    </div>
  );
}
```

- [ ] **Step 5: 핵심 전이 화면 테스트 1개 (AGENTS.md: 화면은 핵심 전이만)**

```bash
cd web && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`web/package.json` scripts에 `"test": "vitest run"` 추가. `web/src/components/AttemptResult.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
```

`web/vite.config.ts`에 vitest 설정 추가:

```ts
// defineConfig 객체에:
test: { environment: 'jsdom' },
```

(파일 상단을 `import { defineConfig } from 'vitest/config';`로 교체)

Run: `cd web && npm test` — Expected: PASS 2. `npm run build`도 성공.

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
