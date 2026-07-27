# Task 07: 교정 화면 + 노트 저장 연동

**Files:**
- Modify: `web/src/pages/CorrectPage.tsx`
- Create: `web/src/components/CliPicker.tsx`, `web/src/hooks/usePolling.ts`
- Modify: `web/src/types.ts` (타입 추가)

**Interfaces:**
- Consumes: 교정 API·`/api/meta/clis`(06), `/api/sentences`(05), `CategoryPicker`(04)
- Produces:
  - `CliPicker` — `{ cli: string; model: string; onChange(cli: string, model: string): void }` props. CLI·모델 2단 select. **연습 화면(10)이 재사용.** `/api/meta/clis` 응답을 내부에서 로드.
  - `usePolling<T>(fetcher: () => Promise<T>, active: boolean, intervalMs = 2000): T | null` — active인 동안 주기 호출. **연습(10)·기록(11)이 재사용.**
  - `types.ts`에 추가: `CliMeta = { name: string; label: string; models: string[] }`, `Correction = { id: number; input_text: string; cli: string; model: string; status: string; result_json: string | null; raw_output: string | null; error_message: string | null; created_at: string }`, `CorrectionResult = { corrected: string; alternatives: { text: string; note_ko: string }[]; explanation_ko: string }`

- [ ] **Step 1: 타입 추가** — `web/src/types.ts`에 위 Produces의 3개 타입을 그대로 추가.

- [ ] **Step 2: usePolling** — `web/src/hooks/usePolling.ts`

```ts
import { useEffect, useState } from 'react';

export function usePolling<T>(fetcher: () => Promise<T>, active: boolean, intervalMs = 2000): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const tick = async () => {
      try { const d = await fetcher(); if (!stopped) setData(d); } catch { /* 다음 틱에 재시도 */ }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(t); };
  }, [active, intervalMs]); // fetcher는 최신 클로저 사용을 위해 의도적으로 deps 제외
  return data;
}
```

- [ ] **Step 3: CliPicker** — `web/src/components/CliPicker.tsx`

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CliMeta } from '../types';

export default function CliPicker(props: { cli: string; model: string; onChange: (cli: string, model: string) => void }) {
  const [metas, setMetas] = useState<CliMeta[]>([]);
  useEffect(() => {
    api<CliMeta[]>('/meta/clis').then((m) => {
      setMetas(m);
      if (!props.cli && m.length) props.onChange(m[0].name, m[0].models[0]);
    });
  }, []);
  const current = metas.find((m) => m.name === props.cli);
  return (
    <span style={{ display: 'inline-flex', gap: 8 }}>
      <select value={props.cli} onChange={(e) => {
        const m = metas.find((x) => x.name === e.target.value)!;
        props.onChange(m.name, m.models[0]);
      }}>
        {metas.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
      </select>
      <select value={props.model} onChange={(e) => props.onChange(props.cli, e.target.value)}>
        {current?.models.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
      </select>
    </span>
  );
}
```

- [ ] **Step 4: 교정 화면** — `web/src/pages/CorrectPage.tsx` 전체 교체

동작: 문장 입력 → [교정 요청] → `POST /corrections`(202, id) → usePolling으로 `GET /corrections/:id` → done이면 결과 렌더, error면 `error_message` + raw_output "원문 보기" `<details>`. 결과의 corrected·각 alternative 옆 [노트에 저장] → CategoryPicker로 카테고리 고르고 `POST /sentences` (`source:'correction'`).

```tsx
import { useState } from 'react';
import { api } from '../api';
import CliPicker from '../components/CliPicker';
import CategoryPicker from '../components/CategoryPicker';
import { usePolling } from '../hooks/usePolling';
import type { Correction, CorrectionResult } from '../types';

function SaveToNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  if (saved) return <small>저장됨 ✓</small>;
  if (!open) return <button onClick={() => setOpen(true)}>노트에 저장</button>;
  return (
    <span>
      <CategoryPicker value={catId} onChange={setCatId} />
      <button disabled={!catId} onClick={async () => {
        await api('/sentences', { method: 'POST', body: JSON.stringify({ category_id: catId, text_en: text, source: 'correction' }) });
        setSaved(true);
      }}>저장</button>
    </span>
  );
}

export default function CorrectPage() {
  const [input, setInput] = useState('');
  const [cli, setCli] = useState('');
  const [model, setModel] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);

  const row = usePolling<Correction>(
    () => api(`/corrections/${jobId}`),
    jobId != null,
  );
  const busy = jobId != null && row?.status !== 'done' && row?.status !== 'error';
  const result: CorrectionResult | null = row?.status === 'done' && row.result_json ? JSON.parse(row.result_json) : null;

  const submit = async () => {
    const { id } = await api<{ id: number }>('/corrections', {
      method: 'POST',
      body: JSON.stringify({ input_text: input, cli, model }),
    });
    setJobId(id);
  };

  return (
    <div>
      <h2>문장 교정</h2>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} style={{ width: '100%' }}
        placeholder="교정받을 영어 문장" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <CliPicker cli={cli} model={model} onChange={(c, m) => { setCli(c); setModel(m); }} />
        <button onClick={submit} disabled={busy || !input.trim()}>{busy ? `${row?.status ?? '요청'} 중…` : '교정 요청'}</button>
      </div>

      {row?.status === 'error' && (
        <div style={{ color: 'crimson' }}>
          <p>{row.error_message}</p>
          {row.raw_output && <details><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
        </div>
      )}
      {result && (
        <div>
          <h3>교정문</h3>
          <p>{result.corrected} <SaveToNote text={result.corrected} /></p>
          <h3>대안 표현</h3>
          <ul>
            {result.alternatives.map((a, i) => (
              <li key={i}>{a.text} — <small>{a.note_ko}</small> <SaveToNote text={a.text} /></li>
            ))}
          </ul>
          <h3>설명</h3>
          <p>{result.explanation_ko}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 빌드 확인**

Run: `cd web && npm run build` — Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add web/src/
git commit -m "feat(stage-07): add correction screen with note save integration"
```

## 사용자 수동 검증

서버·웹 기동 → 교정 탭:
1. "I am jogging since two years." 입력, CLI 선택 → 교정 요청 → 진행 표시 후 교정문·대안·설명 렌더.
2. 대안 하나 [노트에 저장] → 카테고리 선택·저장 → 노트 탭에서 "(교정에서 저장)" 표시로 확인.
3. CLI를 로그인 안 된 것으로 바꿔 실행 → error 상태와 원문 보기 동작 확인.
