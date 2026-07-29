import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import CliPicker from '../components/CliPicker';
import { useTheme, type Theme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import type { Category, CategoryType, Question } from '../types';

export default function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { theme, setTheme } = useTheme();
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const [defCli, setDefCli] = useState('');
  const [defModel, setDefModel] = useState('');
  useEffect(() => {
    api<Record<string, string>>('/settings')
      .then((settings) => {
        if (settings.default_cli) {
          setDefCli(settings.default_cli);
          setDefModel(settings[`default_model_${settings.default_cli}`] ?? '');
        }
      })
      .catch((error) => setErr(error instanceof Error ? error.message : String(error)));
  }, []);
  const saveDefaults = () =>
    guard(async () => {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ default_cli: defCli, [`default_model_${defCli}`]: defModel }),
      });
      toast.success('기본 평가 채널을 저장했습니다.');
    });

  const [cats, setCats] = useState<Category[] | null>(null);
  const [catsRefreshKey, setCatsRefreshKey] = useState(0);
  const [newType, setNewType] = useState<CategoryType>('survey');
  const [newName, setNewName] = useState('');
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<number | null>(null);
  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);

  const loadCats = useCallback(() => {
    api<Category[]>('/categories')
      .then((categories) => {
        setCats(categories);
        setErr(null);
      })
      .catch((error) => setErr(error instanceof Error ? error.message : String(error)));
  }, []);
  useEffect(() => {
    loadCats();
  }, [loadCats]);
  const addCat = () =>
    guard(async () => {
      if (!newName.trim()) return;
      await api('/categories', { method: 'POST', body: JSON.stringify({ type: newType, name: newName }) });
      setNewName('');
      loadCats();
      setCatsRefreshKey((key) => key + 1);
    });
  const startEditCat = (category: Category) => {
    setEditingCatId(category.id);
    setEditCatName(category.name);
    setConfirmDeleteCatId(null);
  };
  const saveEditCat = (category: Category) =>
    guard(async () => {
      if (!editCatName.trim()) return;
      await api(`/categories/${category.id}`, { method: 'PUT', body: JSON.stringify({ name: editCatName }) });
      setEditingCatId(null);
      loadCats();
      setCatsRefreshKey((key) => key + 1);
    });
  const removeCat = (category: Category) =>
    guard(async () => {
      await api(`/categories/${category.id}`, { method: 'DELETE' });
      setConfirmDeleteCatId(null);
      loadCats();
      setCatsRefreshKey((key) => key + 1);
      if (catId === category.id) {
        setCatId(null);
        setQuestions(null);
      }
    });

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
      .then((items) => {
        setQuestions(items);
        setErr(null);
      })
      .catch((error) => setErr(error instanceof Error ? error.message : String(error)));
  }, [catId]);
  useEffect(() => {
    loadQs();
  }, [loadQs]);
  const addQ = () =>
    guard(async () => {
      if (!catId || !newQ.trim()) return;
      await api('/questions', { method: 'POST', body: JSON.stringify({ category_id: catId, text: newQ }) });
      setNewQ('');
      loadQs();
    });
  const startEditQ = (question: Question) => {
    setEditingQId(question.id);
    setEditQText(question.text);
    setConfirmDeleteQId(null);
  };
  const saveEditQ = (question: Question) =>
    guard(async () => {
      if (!editQText.trim()) return;
      await api(`/questions/${question.id}`, { method: 'PUT', body: JSON.stringify({ text: editQText }) });
      setEditingQId(null);
      loadQs();
    });
  const removeQ = (question: Question) =>
    guard(async () => {
      await api(`/questions/${question.id}`, { method: 'DELETE' });
      setConfirmDeleteQId(null);
      loadQs();
    });

  return (
    <div className="page">
      <div className="page-heading">
        <h2>설정</h2>
        <p>부스 테마, 평가 채널, 질문 라이브러리와 접속을 관리합니다.</p>
      </div>
      {err && <ErrorAlert message={err} onDismiss={() => setErr(null)} />}

      <div className="settings-grid">
        <section className="section">
          <h3 className="section__title">화면 테마</h3>
          <Field className="theme-control">
            <FieldLabel htmlFor="theme-select">테마</FieldLabel>
            <select
              id="theme-select"
              className="native-select"
              value={theme}
              onChange={(event) => setTheme(event.target.value as Theme)}
            >
              <option value="dark">다크</option>
              <option value="light">라이트</option>
              <option value="system">시스템 설정</option>
            </select>
            <FieldDescription>브라우저와 Android 시스템 바에 같은 밝기를 적용합니다.</FieldDescription>
          </Field>
        </section>

        <section className="section section--compact">
          <div className="section__row section__row--between">
            <div>
              <h3 className="section__title">접속</h3>
              <p className="section__hint">이 기기의 개인 세션을 종료합니다.</p>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                guard(async () => {
                  await api('/auth/logout', { method: 'POST' });
                  onLogout();
                })
              }
            >
              로그아웃
            </Button>
          </div>
        </section>

        <section className="section section--wide">
          <h3 className="section__title">기본 CLI·모델</h3>
          <div className="section__row">
            <CliPicker
              cli={defCli}
              model={defModel}
              onChange={(cli, model) => {
                setDefCli(cli);
                setDefModel(model);
              }}
            />
            <Button onClick={saveDefaults} disabled={!defCli || !defModel}>
              저장
            </Button>
          </div>
        </section>

        <section className="section">
          <h3 className="section__title">카테고리 관리</h3>
          <div className="section__row">
            <Field>
              <FieldLabel>유형</FieldLabel>
              <Select value={newType} onValueChange={(value) => setNewType(value as CategoryType)}>
                <SelectTrigger aria-label="새 카테고리 유형">
                  <SelectValue>{newType === 'survey' ? '서베이' : '롤플레잉'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="survey">서베이</SelectItem>
                  <SelectItem value="roleplay">롤플레잉</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="new-cat-name">이름</FieldLabel>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="예: 국내여행"
              />
            </Field>
            <Button onClick={addCat} disabled={!newName.trim()}>
              추가
            </Button>
          </div>
          {cats === null && <ListSkeleton rows={3} />}
          {cats !== null && cats.length === 0 && (
            <ActionEmpty message="위 입력 채널에서 첫 카테고리를 추가해 보세요." />
          )}
          {cats !== null && cats.length > 0 && (
            <ul className="row-list">
              {cats.map((category) => (
                <li key={category.id} className="row-list__item">
                  {editingCatId === category.id ? (
                    <div className="row-list__edit-form">
                      <Input
                        aria-label="카테고리 이름 수정"
                        value={editCatName}
                        onChange={(event) => setEditCatName(event.target.value)}
                        autoFocus
                      />
                      <div className="row-list__actions">
                        <Button size="sm" onClick={() => saveEditCat(category)} disabled={!editCatName.trim()}>
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
                          [{category.type === 'survey' ? '서베이' : '롤플레잉'}] {category.name}
                        </span>
                      </div>
                      <div className="row-list__actions">
                        <Button size="sm" variant="ghost" onClick={() => startEditCat(category)}>
                          수정
                        </Button>
                        <AlertDialog
                          open={confirmDeleteCatId === category.id}
                          onOpenChange={(open) => setConfirmDeleteCatId(open ? category.id : null)}
                        >
                          <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>삭제</AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>카테고리를 삭제할까요?</AlertDialogTitle>
                              <AlertDialogDescription>
                                연결된 문항과 표현 노트도 함께 삭제되며 되돌릴 수 없습니다.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction variant="destructive" onClick={() => removeCat(category)}>
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
        </section>

        <section className="section">
          <h3 className="section__title">문항 관리</h3>
          <CategoryPicker value={catId} onChange={setCatId} refreshKey={catsRefreshKey} />
          {catId && (
            <>
              <div className="section__row">
                <Field>
                  <FieldLabel htmlFor="new-q-text">문항 영어 텍스트</FieldLabel>
                  <Textarea id="new-q-text" value={newQ} onChange={(event) => setNewQ(event.target.value)} rows={2} />
                </Field>
                <Button onClick={addQ} disabled={!newQ.trim()}>
                  추가
                </Button>
              </div>
              {questions === null && <ListSkeleton rows={3} />}
              {questions !== null && questions.length === 0 && (
                <ActionEmpty message="위 입력 채널에서 첫 질문을 추가해 보세요." />
              )}
              {questions !== null && questions.length > 0 && (
                <ul className="row-list">
                  {questions.map((question) => (
                    <li key={question.id} className="row-list__item">
                      {editingQId === question.id ? (
                        <div className="row-list__edit-form">
                          <Input
                            aria-label="문항 수정"
                            value={editQText}
                            onChange={(event) => setEditQText(event.target.value)}
                            autoFocus
                          />
                          <div className="row-list__actions">
                            <Button size="sm" onClick={() => saveEditQ(question)} disabled={!editQText.trim()}>
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
                            <span className="row-list__text">{question.text}</span>
                          </div>
                          <div className="row-list__actions">
                            <Button size="sm" variant="ghost" onClick={() => startEditQ(question)}>
                              수정
                            </Button>
                            <AlertDialog
                              open={confirmDeleteQId === question.id}
                              onOpenChange={(open) => setConfirmDeleteQId(open ? question.id : null)}
                            >
                              <AlertDialogTrigger render={<Button size="sm" variant="ghost" />}>
                                삭제
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>문항을 삭제할까요?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    이 문항은 목록에서 제거되며 되돌릴 수 없습니다.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>취소</AlertDialogCancel>
                                  <AlertDialogAction variant="destructive" onClick={() => removeQ(question)}>
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
