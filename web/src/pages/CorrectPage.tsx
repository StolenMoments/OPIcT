import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CliPicker from '../components/CliPicker';
import CategoryPicker from '../components/CategoryPicker';
import { usePolling } from '../hooks/usePolling';
import type { Correction, CorrectionResult } from '../types';

function safeParseResult(json: string | null): CorrectionResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as CorrectionResult;
  } catch {
    return null;
  }
}

function SaveToNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    try {
      await api('/sentences', {
        method: 'POST',
        body: JSON.stringify({ category_id: catId, text_en: text, source: 'correction' }),
      });
      setSaved(true);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (saved) return <small>저장됨 ✓</small>;
  if (!open) return <button onClick={() => setOpen(true)}>노트에 저장</button>;
  return (
    <span>
      <CategoryPicker value={catId} onChange={setCatId} />
      <button disabled={!catId} onClick={save}>저장</button>
      {err && <small style={{ color: 'crimson' }}> {err}</small>}
    </span>
  );
}

export default function CorrectPage() {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const [input, setInput] = useState('');
  const [cli, setCli] = useState('');
  const [model, setModel] = useState('');
  const [jobId, setJobId] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  const rawRow = usePolling<Correction>(() => api<Correction>(`/corrections/${jobId}`), active);
  // rawRow can still hold the previous job's data for one render after a new
  // job starts (usePolling's internal state isn't cleared on activation), so
  // gate it on the current jobId before treating it as "the" row.
  const row = rawRow?.id === jobId ? rawRow : null;

  // settled/active are derived from `row`, which only ever reflects data that
  // passed through usePolling's own `stopped` guard — never a mirrored,
  // separately-raced side effect.
  useEffect(() => {
    if (row && (row.status === 'done' || row.status === 'error')) {
      setActive(false);
    }
  }, [row]);

  const settled = row?.status === 'done' || row?.status === 'error';
  const busy = jobId != null && !settled;
  const result = row?.status === 'done' ? safeParseResult(row.result_json) : null;
  const parseFailed = row?.status === 'done' && row.result_json != null && result === null;

  const submit = () => guard(async () => {
    if (!input.trim()) return;
    const { id } = await api<{ id: number }>('/corrections', {
      method: 'POST',
      body: JSON.stringify({ input_text: input, cli, model }),
    });
    setJobId(id);
    setActive(true);
  });

  return (
    <div>
      <h2>문장 교정</h2>
      {err && <p style={{ color: 'red' }}>{err}</p>}
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
      {parseFailed && (
        <div style={{ color: 'crimson' }}>
          <p>결과를 표시할 수 없습니다.</p>
          {row?.raw_output && <details><summary>원문 보기</summary><pre>{row.raw_output}</pre></details>}
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
