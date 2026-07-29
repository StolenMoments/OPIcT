import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import ErrorAlert from '@/components/ui/ErrorAlert';
import ActionEmpty from '@/components/ui/ActionEmpty';
import ListSkeleton from '@/components/ui/ListSkeleton';
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
  useEffect(() => {
    load();
  }, [load]);

  const add = () =>
    guard(async () => {
      if (!catId || !textEn.trim()) return;
      await api('/sentences', {
        method: 'POST',
        body: JSON.stringify({ category_id: catId, text_en: textEn, memo: memo || null }),
      });
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
      <div className="page-heading">
        <h2>표현 노트</h2>
        <p>교정에서 건진 표현과 직접 만든 문장을 채널별로 정리합니다.</p>
      </div>
      {err && <ErrorAlert message={err} onDismiss={() => setErr(null)} />}

      <CategoryPicker value={catId} onChange={setCatId} />

      {catId == null && <ActionEmpty message="카테고리를 선택하면 저장된 표현과 새 문장 입력 채널이 열립니다." />}

      {catId && (
        <div className="section">
          <div className="section__row">
            <Field>
              <FieldLabel htmlFor="note-text">영어 문장</FieldLabel>
              <Textarea
                id="note-text"
                value={textEn}
                onChange={(e) => setTextEn(e.target.value)}
                placeholder="저장할 영어 문장"
                rows={2}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="note-memo">메모 (선택)</FieldLabel>
              <Input id="note-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" />
            </Field>
            <Button onClick={add} disabled={!textEn.trim()}>
              추가
            </Button>
          </div>

          {items === null && <ListSkeleton rows={3} />}

          {items !== null && items.length === 0 && (
            <ActionEmpty message="위 입력 채널에서 첫 영어 문장을 저장해 보세요." />
          )}

          {items !== null && items.length > 0 && (
            <ul className="row-list">
              {items.map((s) => (
                <li key={s.id} className="row-list__item">
                  {editingId === s.id ? (
                    <div className="row-list__edit-form">
                      <Input
                        aria-label="문장 수정"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="row-list__actions">
                        <Button size="sm" onClick={() => saveEdit(s)} disabled={!editText.trim()}>
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
                        <AlertDialog
                          open={confirmingDeleteId === s.id}
                          onOpenChange={(open) => setConfirmingDeleteId(open ? s.id : null)}
                        >
                          <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>삭제</AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>이 표현을 삭제할까요?</AlertDialogTitle>
                              <AlertDialogDescription>
                                저장된 문장과 메모가 삭제되며 되돌릴 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => remove(s)}>
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
