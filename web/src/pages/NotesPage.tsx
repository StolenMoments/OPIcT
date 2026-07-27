import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import type { Sentence } from '../types';

export default function NotesPage() {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const [catId, setCatId] = useState<number | null>(null);
  const [items, setItems] = useState<Sentence[]>([]);
  const [textEn, setTextEn] = useState('');
  const [memo, setMemo] = useState('');

  const load = useCallback(() => {
    if (catId) api<Sentence[]>(`/sentences?category_id=${catId}`).then(setItems).catch(() => {});
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const add = () => guard(async () => {
    if (!catId || !textEn.trim()) return;
    await api('/sentences', { method: 'POST', body: JSON.stringify({ category_id: catId, text_en: textEn, memo: memo || null }) });
    setTextEn(''); setMemo(''); load();
  });
  const edit = (s: Sentence) => guard(async () => {
    const text_en = prompt('문장 수정', s.text_en);
    if (!text_en) return;
    await api(`/sentences/${s.id}`, { method: 'PUT', body: JSON.stringify({ text_en }) });
    load();
  });
  const remove = (s: Sentence) => guard(async () => {
    if (!confirm('삭제?')) return;
    await api(`/sentences/${s.id}`, { method: 'DELETE' });
    load();
  });

  return (
    <div>
      <h2>표현 노트</h2>
      {err && <p style={{ color: 'red' }}>{err}</p>}
      <CategoryPicker value={catId} onChange={setCatId} />
      {catId && (
        <>
          <div style={{ marginTop: 8 }}>
            <textarea value={textEn} onChange={(e) => setTextEn(e.target.value)} placeholder="영어 문장" rows={2} style={{ width: '100%' }} />
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" style={{ width: '100%' }} />
            <button onClick={add}>추가</button>
          </div>
          <ul>
            {items.map((s) => (
              <li key={s.id} style={{ marginBottom: 8 }}>
                <div>{s.text_en} {s.source === 'correction' && <small>(교정에서 저장)</small>}</div>
                {s.memo && <small>{s.memo}</small>}{' '}
                <button onClick={() => edit(s)}>수정</button>{' '}
                <button onClick={() => remove(s)}>삭제</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
