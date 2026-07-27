import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import ErrorBanner from '../components/ui/ErrorBanner';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import type { Category, CategoryType, Question } from '../types';

export default function SettingsPage() {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // 카테고리 관리
  const [cats, setCats] = useState<Category[] | null>(null);
  const [catsRefreshKey, setCatsRefreshKey] = useState(0);
  const [newType, setNewType] = useState<CategoryType>('survey');
  const [newName, setNewName] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<number | null>(null);

  const loadCats = useCallback(() => {
    api<Category[]>('/categories')
      .then((c) => {
        setCats(c);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const addCat = () =>
    guard(async () => {
      if (!newName.trim()) return;
      await api('/categories', { method: 'POST', body: JSON.stringify({ type: newType, name: newName }) });
      setNewName('');
      loadCats();
      setCatsRefreshKey((k) => k + 1);
    });

  const startEditCat = (c: Category) => {
    setEditingCatId(c.id);
    setEditCatName(c.name);
    setConfirmDeleteCatId(null);
  };
  const saveEditCat = (c: Category) =>
    guard(async () => {
      if (!editCatName.trim()) return;
      await api(`/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ name: editCatName }) });
      setEditingCatId(null);
      loadCats();
      setCatsRefreshKey((k) => k + 1);
    });

  const removeCat = (c: Category) =>
    guard(async () => {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      setConfirmDeleteCatId(null);
      loadCats();
      setCatsRefreshKey((k) => k + 1);
      if (catId === c.id) {
        setCatId(null);
        setQuestions(null);
      }
    });

  // 문항 관리
  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [newQ, setNewQ] = useState('');
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [editQText, setEditQText] = useState('');
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<number | null>(null);

  const loadQs = useCallback(() => {
    if (!catId) {
      setQuestions(null);
      return;
    }
    setQuestions(null);
    api<Question[]>(`/questions?category_id=${catId}`)
      .then((q) => {
        setQuestions(q);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [catId]);
  useEffect(() => { loadQs(); }, [loadQs]);

  const addQ = () =>
    guard(async () => {
      if (!catId || !newQ.trim()) return;
      await api('/questions', { method: 'POST', body: JSON.stringify({ category_id: catId, text: newQ }) });
      setNewQ('');
      loadQs();
    });

  const startEditQ = (q: Question) => {
    setEditingQId(q.id);
    setEditQText(q.text);
    setConfirmDeleteQId(null);
  };
  const saveEditQ = (q: Question) =>
    guard(async () => {
      if (!editQText.trim()) return;
      await api(`/questions/${q.id}`, { method: 'PUT', body: JSON.stringify({ text: editQText }) });
      setEditingQId(null);
      loadQs();
    });
  const removeQ = (q: Question) =>
    guard(async () => {
      await api(`/questions/${q.id}`, { method: 'DELETE' });
      setConfirmDeleteQId(null);
      loadQs();
    });

  return (
    <div className="page">
      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}

      <div className="section">
        <h2 className="section__title">카테고리 관리</h2>
        <div className="section__row">
          <Field label="유형" htmlFor="new-cat-type">
            <select id="new-cat-type" className="select" value={newType} onChange={(e) => setNewType(e.target.value as CategoryType)}>
              <option value="survey">서베이</option>
              <option value="roleplay">롤플레잉</option>
            </select>
          </Field>
          <Field label="이름" htmlFor="new-cat-name">
            <input id="new-cat-name" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 국내여행" />
          </Field>
          <Button variant="primary" onClick={addCat} disabled={!newName.trim()}>
            추가
          </Button>
        </div>

        {cats === null && <Skeleton rows={3} />}
        {cats !== null && cats.length === 0 && (
          <EmptyState message="아직 카테고리가 없습니다. 위에서 첫 카테고리를 추가해 보세요." />
        )}
        {cats !== null && cats.length > 0 && (
          <ul className="row-list">
            {cats.map((c) => (
              <li key={c.id} className="row-list__item">
                {editingCatId === c.id ? (
                  <div className="row-list__edit-form">
                    <input className="input" aria-label="카테고리 이름 수정" value={editCatName} onChange={(e) => setEditCatName(e.target.value)} autoFocus />
                    <div className="row-list__actions">
                      <Button size="sm" variant="primary" onClick={() => saveEditCat(c)} disabled={!editCatName.trim()}>
                        저장
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingCatId(null)}>
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="row-list__main">
                      <span className="row-list__text">
                        [{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}
                      </span>
                    </div>
                    <div className="row-list__actions">
                      <Button size="sm" variant="ghost" onClick={() => startEditCat(c)}>
                        수정
                      </Button>
                      {confirmDeleteCatId === c.id ? (
                        <>
                          <span className="row-list__meta">문항·노트도 함께 삭제됩니다</span>
                          <Button size="sm" variant="danger" onClick={() => removeCat(c)}>
                            정말 삭제
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteCatId(null)}>
                            취소
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteCatId(c.id)}>
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

      <div className="section">
        <h2 className="section__title">문항 관리</h2>
        <CategoryPicker value={catId} onChange={setCatId} refreshKey={catsRefreshKey} />

        {catId && (
          <>
            <div className="section__row">
              <Field label="문항 영어 텍스트" htmlFor="new-q-text">
                <textarea id="new-q-text" className="textarea" value={newQ} onChange={(e) => setNewQ(e.target.value)} rows={2} />
              </Field>
              <Button variant="primary" onClick={addQ} disabled={!newQ.trim()}>
                추가
              </Button>
            </div>

            {questions === null && <Skeleton rows={3} />}
            {questions !== null && questions.length === 0 && (
              <EmptyState message="이 카테고리에 문항이 아직 없습니다. 위에서 문항을 추가해 보세요." />
            )}
            {questions !== null && questions.length > 0 && (
              <ul className="row-list">
                {questions.map((q) => (
                  <li key={q.id} className="row-list__item">
                    {editingQId === q.id ? (
                      <div className="row-list__edit-form">
                        <input className="input" aria-label="문항 수정" value={editQText} onChange={(e) => setEditQText(e.target.value)} autoFocus />
                        <div className="row-list__actions">
                          <Button size="sm" variant="primary" onClick={() => saveEditQ(q)} disabled={!editQText.trim()}>
                            저장
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingQId(null)}>
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="row-list__main">
                          <span className="row-list__text">{q.text}</span>
                        </div>
                        <div className="row-list__actions">
                          <Button size="sm" variant="ghost" onClick={() => startEditQ(q)}>
                            수정
                          </Button>
                          {confirmDeleteQId === q.id ? (
                            <>
                              <Button size="sm" variant="danger" onClick={() => removeQ(q)}>
                                정말 삭제
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteQId(null)}>
                                취소
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteQId(q.id)}>
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
          </>
        )}
      </div>
    </div>
  );
}
