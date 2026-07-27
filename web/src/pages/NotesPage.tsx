import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import ErrorBanner from '../components/ui/ErrorBanner';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
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
  const [items, setItems] = useState<Sentence[] | null>(null);
  const [textEn, setTextEn] = useState('');
  const [memo, setMemo] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!catId) {
      setItems(null);
      return;
    }
    setItems(null);
    api<Sentence[]>(`/sentences?category_id=${catId}`)
      .then((s) => {
        setItems(s);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [catId]);
  useEffect(() => { load(); }, [load]);

  const add = () =>
    guard(async () => {
      if (!catId || !textEn.trim()) return;
      await api('/sentences', { method: 'POST', body: JSON.stringify({ category_id: catId, text_en: textEn, memo: memo || null }) });
      setTextEn('');
      setMemo('');
      load();
    });

  const startEdit = (s: Sentence) => {
    setEditingId(s.id);
    setEditText(s.text_en);
    setConfirmingDeleteId(null);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (s: Sentence) =>
    guard(async () => {
      if (!editText.trim()) return;
      await api(`/sentences/${s.id}`, { method: 'PUT', body: JSON.stringify({ text_en: editText }) });
      setEditingId(null);
      load();
    });

  const remove = (s: Sentence) =>
    guard(async () => {
      await api(`/sentences/${s.id}`, { method: 'DELETE' });
      setConfirmingDeleteId(null);
      load();
    });

  return (
    <div className="page">
      <h2>표현 노트</h2>
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}

      <CategoryPicker value={catId} onChange={setCatId} />

      {catId && (
        <div className="section">
          <div className="section__row">
            <Field label="영어 문장" htmlFor="note-text">
              <textarea
                id="note-text"
                className="textarea"
                value={textEn}
                onChange={(e) => setTextEn(e.target.value)}
                placeholder="저장할 영어 문장"
                rows={2}
              />
            </Field>
            <Field label="메모 (선택)" htmlFor="note-memo">
              <input id="note-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" />
            </Field>
            <Button variant="primary" onClick={add} disabled={!textEn.trim()}>
              추가
            </Button>
          </div>

          {items === null && <Skeleton rows={3} />}

          {items !== null && items.length === 0 && (
            <EmptyState message="이 카테고리에 저장된 표현이 아직 없습니다. 위에서 문장을 추가해 보세요." />
          )}

          {items !== null && items.length > 0 && (
            <ul className="row-list">
              {items.map((s) => (
                <li key={s.id} className="row-list__item">
                  {editingId === s.id ? (
                    <div className="row-list__edit-form">
                      <input
                        className="input"
                        aria-label="문장 수정"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="row-list__actions">
                        <Button size="sm" variant="primary" onClick={() => saveEdit(s)} disabled={!editText.trim()}>
                          저장
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="row-list__main">
                        <span className="row-list__text">
                          {s.text_en}
                          {s.source === 'correction' && <span className="muted"> (교정에서 저장)</span>}
                        </span>
                        {s.memo && <span className="row-list__meta">{s.memo}</span>}
                      </div>
                      <div className="row-list__actions">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                          수정
                        </Button>
                        {confirmingDeleteId === s.id ? (
                          <>
                            <Button size="sm" variant="danger" onClick={() => remove(s)}>
                              정말 삭제
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmingDeleteId(null)}>
                              취소
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmingDeleteId(s.id)}>
                            삭제
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
