# Task 04: 설정 탭 — 카테고리·문항 관리 UI

**Files:**
- Modify: `web/src/pages/SettingsPage.tsx`
- Create: `web/src/components/CategoryPicker.tsx`

**Interfaces:**
- Consumes: `api` 헬퍼(Task 03), 카테고리·문항 API(Task 02)
- Produces:
  - `CategoryPicker` — `{ value: number | null, onChange(id: number): void, type?: 'survey' | 'roleplay', refreshKey?: number }` props(`refreshKey`는 선택값, 부모가 강제 재조회를 트리거할 때만 사용 — 기존 3개 prop만 넘겨도 동작). 카테고리를 `<select>`로 고르는 공용 컴포넌트. **노트(05)·교정(07)·연습(10) 화면이 재사용.**
  - `Category = { id: number; type: 'survey' | 'roleplay'; name: string; sort_order: number }`, `Question = { id: number; category_id: number; text: string; note: string | null }` 타입을 `web/src/types.ts`에 정의(Create에 추가).

- [ ] **Step 1: 타입 정의** — `web/src/types.ts`

```ts
export type CategoryType = 'survey' | 'roleplay';
export type Category = { id: number; type: CategoryType; name: string; sort_order: number };
export type Question = { id: number; category_id: number; text: string; note: string | null; created_at: string };
export type Sentence = { id: number; category_id: number; text_en: string; memo: string | null; source: 'manual' | 'correction'; created_at: string };
```

- [ ] **Step 2: CategoryPicker** — `web/src/components/CategoryPicker.tsx`

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Category, CategoryType } from '../types';

export default function CategoryPicker(props: {
  value: number | null;
  onChange: (id: number) => void;
  type?: CategoryType;
  refreshKey?: number;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  useEffect(() => {
    api<Category[]>(`/categories${props.type ? `?type=${props.type}` : ''}`)
      .then(setCats)
      .catch(() => {});
  }, [props.type, props.refreshKey]);
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange(Number(e.target.value))}>
      <option value="" disabled>카테고리 선택</option>
      {cats.map((c) => (
        <option key={c.id} value={c.id}>[{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: SettingsPage에 관리 UI 구현** — `web/src/pages/SettingsPage.tsx` 전체 교체

구성: 위쪽 "카테고리 관리"(type 선택 + 이름 입력 + 추가, 목록에 이름 인라인 수정·삭제 버튼), 아래쪽 "문항 관리"(CategoryPicker로 카테고리 선택 → 그 카테고리 문항 목록 + textarea로 추가, 항목별 수정·삭제). 모든 mutation 핸들러는 `api()`가 던지는 에러를 잡아 화면 상단에 표시하고(unhandled rejection 방지), 카테고리 추가/수정/삭제 시 `CategoryPicker`의 `refreshKey`를 올려 목록을 강제 재조회하며, 선택 중인 카테고리가 삭제되면 `catId`를 `null`로 리셋해 죽은 id로 요청이 나가지 않게 한다.

```tsx
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
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
  const [cats, setCats] = useState<Category[]>([]);
  const [catsRefreshKey, setCatsRefreshKey] = useState(0);
  const [newType, setNewType] = useState<CategoryType>('survey');
  const [newName, setNewName] = useState('');
  const loadCats = useCallback(() => api<Category[]>('/categories').then(setCats).catch(() => {}), []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const addCat = () => guard(async () => {
    if (!newName.trim()) return;
    await api('/categories', { method: 'POST', body: JSON.stringify({ type: newType, name: newName }) });
    setNewName(''); loadCats(); setCatsRefreshKey((k) => k + 1);
  });
  const renameCat = (c: Category) => guard(async () => {
    const name = prompt('새 이름', c.name);
    if (!name) return;
    await api(`/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    loadCats(); setCatsRefreshKey((k) => k + 1);
  });
  const removeCat = (c: Category) => guard(async () => {
    if (!confirm(`"${c.name}" 삭제? 문항·노트도 함께 삭제됩니다.`)) return;
    await api(`/categories/${c.id}`, { method: 'DELETE' });
    loadCats(); setCatsRefreshKey((k) => k + 1);
    if (catId === c.id) {
      setCatId(null);
      setQuestions([]);
    }
  });

  // 문항 관리
  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQ, setNewQ] = useState('');
  const loadQs = useCallback(() => {
    if (catId) api<Question[]>(`/questions?category_id=${catId}`).then(setQuestions).catch(() => {});
  }, [catId]);
  useEffect(() => { loadQs(); }, [loadQs]);

  const addQ = () => guard(async () => {
    if (!catId || !newQ.trim()) return;
    await api('/questions', { method: 'POST', body: JSON.stringify({ category_id: catId, text: newQ }) });
    setNewQ(''); loadQs();
  });
  const editQ = (q: Question) => guard(async () => {
    const text = prompt('문항 수정', q.text);
    if (!text) return;
    await api(`/questions/${q.id}`, { method: 'PUT', body: JSON.stringify({ text }) });
    loadQs();
  });
  const removeQ = (q: Question) => guard(async () => {
    if (!confirm('문항 삭제?')) return;
    await api(`/questions/${q.id}`, { method: 'DELETE' });
    loadQs();
  });

  return (
    <div>
      {err && <p style={{ color: 'red' }}>{err}</p>}

      <h2>카테고리 관리</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={newType} onChange={(e) => setNewType(e.target.value as CategoryType)}>
          <option value="survey">서베이</option>
          <option value="roleplay">롤플레잉</option>
        </select>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 국내여행" />
        <button onClick={addCat}>추가</button>
      </div>
      <ul>
        {cats.map((c) => (
          <li key={c.id}>
            [{c.type === 'survey' ? '서베이' : '롤플레잉'}] {c.name}{' '}
            <button onClick={() => renameCat(c)}>수정</button>{' '}
            <button onClick={() => removeCat(c)}>삭제</button>
          </li>
        ))}
      </ul>

      <h2>문항 관리</h2>
      <CategoryPicker value={catId} onChange={setCatId} refreshKey={catsRefreshKey} />
      {catId && (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <textarea value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="문항 영어 텍스트" rows={2} style={{ flex: 1 }} />
            <button onClick={addQ}>추가</button>
          </div>
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                {q.text}{' '}
                <button onClick={() => editQ(q)}>수정</button>{' '}
                <button onClick={() => removeQ(q)}>삭제</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd web && npm run build`
Expected: 타입 에러 없이 성공

- [ ] **Step 5: 커밋**

```bash
git add web/src/
git commit -m "feat(stage-04): add category and question admin ui"
```

## 사용자 수동 검증

서버·웹 dev 서버 기동 → 설정 탭에서:
1. 서베이 카테고리 "국내여행", 롤플레잉 카테고리 "병원 예약" 추가 → 목록 표시.
2. "국내여행" 선택 후 문항 추가 → 목록 표시, 수정·삭제 동작.
3. 새로고침해도 데이터 유지.
