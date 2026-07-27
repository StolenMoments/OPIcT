# Task 05: 표현 노트 — sentences API + 노트 화면

**Files:**
- Create: `server/src/repo/sentences.js`, `server/src/routes/sentences.js`, `server/test/sentences.test.js`
- Modify: `server/src/repo/index.js`, `server/src/app.js`, `web/src/pages/NotesPage.tsx`

**Interfaces:**
- Consumes: `app.repos`(01), `CategoryPicker`·`types.ts`(04)
- Produces:
  - `repos.sentences`: `list(categoryId?)`, `get(id)`, `create({category_id,text_en,memo,source})`, `update(id,{text_en,memo})`, `remove(id)` — **교정 화면(07)이 `create`를 `source:'correction'`으로 재사용.**
  - `GET /api/sentences?category_id=N`, `POST /api/sentences` body `{category_id,text_en,memo?,source?}` → 201, `PUT /api/sentences/:id` body `{text_en?,memo?}`, `DELETE /api/sentences/:id` → 204

- [ ] **Step 1: 실패하는 테스트** — `server/test/sentences.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('sentence crud', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'survey', name: '조깅' } })).json();

  const created = await app.inject({ method: 'POST', url: '/api/sentences',
    payload: { category_id: cat.id, text_en: 'I go jogging every morning to clear my head.', memo: '아침 조깅' } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().source, 'manual');

  const fromCorrection = await app.inject({ method: 'POST', url: '/api/sentences',
    payload: { category_id: cat.id, text_en: 'Jogging helps me stay in shape.', source: 'correction' } });
  assert.equal(fromCorrection.json().source, 'correction');

  const list = await app.inject({ url: `/api/sentences?category_id=${cat.id}` });
  assert.equal(list.json().length, 2);

  const del = await app.inject({ method: 'DELETE', url: `/api/sentences/${created.json().id}` });
  assert.equal(del.statusCode, 204);
});

test('POST sentences with nonexistent category_id rejected with 400, not 500', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/sentences', payload: { category_id: 9999, text_en: 'hello' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, '존재하지 않는 category_id입니다');
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd server && npm test` — Expected: FAIL (404)

- [ ] **Step 3: repo + 라우트 구현**

`server/src/repo/sentences.js`:

```js
export function sentencesRepo(db) {
  return {
    list(categoryId) {
      return categoryId
        ? db.prepare('SELECT * FROM sentences WHERE category_id=? ORDER BY id DESC').all(categoryId)
        : db.prepare('SELECT * FROM sentences ORDER BY id DESC').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM sentences WHERE id=?').get(id);
    },
    create({ category_id, text_en, memo = null, source = 'manual' }) {
      const info = db.prepare('INSERT INTO sentences (category_id,text_en,memo,source) VALUES (?,?,?,?)')
        .run(category_id, text_en, memo, source);
      return this.get(info.lastInsertRowid);
    },
    update(id, { text_en, memo }) {
      db.prepare('UPDATE sentences SET text_en=?, memo=? WHERE id=?').run(text_en, memo, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM sentences WHERE id=?').run(id);
    },
  };
}
```

`server/src/routes/sentences.js`:

```js
export async function sentencesRoutes(app) {
  const repo = app.repos.sentences;

  app.get('/api/sentences', async (req) => repo.list(req.query.category_id));

  app.post('/api/sentences', async (req, reply) => {
    const { category_id, text_en, memo = null, source = 'manual' } = req.body ?? {};
    if (!category_id || !text_en?.trim()) return reply.code(400).send({ error: 'category_id와 text_en은 필수입니다' });
    if (!app.repos.categories.get(category_id))
      return reply.code(400).send({ error: '존재하지 않는 category_id입니다' });
    return reply.code(201).send(repo.create({ category_id, text_en: text_en.trim(), memo, source }));
  });

  app.put('/api/sentences/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { text_en = row.text_en, memo = row.memo } = req.body ?? {};
    return repo.update(row.id, { text_en, memo });
  });

  app.delete('/api/sentences/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
```

`repo/index.js`에 `sentences: sentencesRepo(db)` 추가, `app.js`에 `sentencesRoutes` 등록 (Task 02와 동일 패턴).

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd server && npm test` — Expected: PASS

- [ ] **Step 5: 노트 화면** — `web/src/pages/NotesPage.tsx` 전체 교체

```tsx
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
```

Run: `cd web && npm run build` — Expected: 성공

- [ ] **Step 6: 커밋**

```bash
git add server/ web/src/
git commit -m "feat(stage-05): add sentence notes api and screen"
```

## 사용자 수동 검증

노트 탭 → 카테고리 선택 → 문장+메모 추가/수정/삭제, 새로고침 후 유지 확인.
