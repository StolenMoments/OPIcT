# Task 02: 카테고리·문항 CRUD API

**Files:**
- Create: `server/src/repo/categories.js`, `server/src/repo/questions.js`, `server/src/routes/categories.js`, `server/src/routes/questions.js`, `server/test/categories.test.js`, `server/test/questions.test.js`
- Modify: `server/src/app.js`(라우트 등록), `server/src/repo/index.js`(repo 등록)

**Interfaces:**
- Consumes: `buildApp`, `app.repos`, `createRepos` (Task 01)
- Produces (repo — 라우트가 아닌 곳에서도 재사용):
  - `repos.categories`: `list(type?)`, `get(id)`, `create({type,name,sort_order})`, `update(id,{name,sort_order})`, `remove(id)`
  - `repos.questions`: `list(categoryId?)`, `get(id)`, `create({category_id,text,note})`, `update(id,{text,note,category_id})`, `remove(id)`
  - repo는 평범한 객체(plain row object) 반환, DB 드라이버 타입 노출 금지.
- Produces (HTTP):
  - `GET /api/categories?type=survey|roleplay` → `[{id,type,name,sort_order}]` (sort_order, id 순)
  - `POST /api/categories` body `{type,name,sort_order?}` → `201 {id,...}`
  - `PUT /api/categories/:id` body `{name?,sort_order?}` → `200 {id,...}` / 없으면 404
  - `DELETE /api/categories/:id` → `204` (문항·문장 CASCADE 삭제)
  - `GET /api/questions?category_id=N` → `[{id,category_id,text,note,created_at}]`
  - `POST /api/questions` body `{category_id,text,note?}` → `201`
  - `PUT /api/questions/:id` body `{text?,note?,category_id?}` → `200` / 404
  - `DELETE /api/questions/:id` → `204`
  - 검증 실패는 `400 {error: "..."}`. 이 오류 형태를 이후 모든 라우트가 따른다.

- [ ] **Step 1: 실패하는 테스트 작성** — `server/test/categories.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

async function post(app, url, body) {
  return app.inject({ method: 'POST', url, payload: body });
}

test('category crud', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());

  const created = await post(app, '/api/categories', { type: 'survey', name: '국내여행' });
  assert.equal(created.statusCode, 201);
  const cat = created.json();

  const list = await app.inject({ url: '/api/categories?type=survey' });
  assert.equal(list.json().length, 1);

  const upd = await app.inject({ method: 'PUT', url: `/api/categories/${cat.id}`, payload: { name: '해외여행' } });
  assert.equal(upd.json().name, '해외여행');

  const del = await app.inject({ method: 'DELETE', url: `/api/categories/${cat.id}` });
  assert.equal(del.statusCode, 204);
  assert.equal((await app.inject({ url: '/api/categories' })).json().length, 0);
});

test('invalid type rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await post(app, '/api/categories', { type: 'wrong', name: 'x' });
  assert.equal(res.statusCode, 400);
});
```

`server/test/questions.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('question crud + cascade', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'roleplay', name: '병원 예약' } })).json();

  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'Call the clinic and make an appointment.' } }));
  assert.equal(q.statusCode, 201);

  const list = await app.inject({ url: `/api/questions?category_id=${cat.id}` });
  assert.equal(list.json().length, 1);

  await app.inject({ method: 'DELETE', url: `/api/categories/${cat.id}` });
  assert.equal((await app.inject({ url: '/api/questions' })).json().length, 0);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd server && npm test`
Expected: FAIL (404 — 라우트 없음)

- [ ] **Step 3: repo 구현 (SQL은 여기에만)**

`server/src/repo/categories.js`:

```js
export function categoriesRepo(db) {
  return {
    list(type) {
      return type
        ? db.prepare('SELECT * FROM categories WHERE type=? ORDER BY sort_order,id').all(type)
        : db.prepare('SELECT * FROM categories ORDER BY sort_order,id').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM categories WHERE id=?').get(id);
    },
    create({ type, name, sort_order = 0 }) {
      const info = db.prepare('INSERT INTO categories (type,name,sort_order) VALUES (?,?,?)').run(type, name, sort_order);
      return this.get(info.lastInsertRowid);
    },
    update(id, { name, sort_order }) {
      db.prepare('UPDATE categories SET name=?, sort_order=? WHERE id=?').run(name, sort_order, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM categories WHERE id=?').run(id);
    },
  };
}
```

`server/src/repo/questions.js`:

```js
export function questionsRepo(db) {
  return {
    list(categoryId) {
      return categoryId
        ? db.prepare('SELECT * FROM questions WHERE category_id=? ORDER BY id').all(categoryId)
        : db.prepare('SELECT * FROM questions ORDER BY id').all();
    },
    get(id) {
      return db.prepare('SELECT * FROM questions WHERE id=?').get(id);
    },
    create({ category_id, text, note = null }) {
      const info = db.prepare('INSERT INTO questions (category_id,text,note) VALUES (?,?,?)').run(category_id, text, note);
      return this.get(info.lastInsertRowid);
    },
    update(id, { text, note, category_id }) {
      db.prepare('UPDATE questions SET text=?, note=?, category_id=? WHERE id=?').run(text, note, category_id, id);
      return this.get(id);
    },
    remove(id) {
      db.prepare('DELETE FROM questions WHERE id=?').run(id);
    },
  };
}
```

`server/src/repo/index.js`에 등록:

```js
import { categoriesRepo } from './categories.js';
import { questionsRepo } from './questions.js';

export function createRepos(db) {
  return {
    categories: categoriesRepo(db),
    questions: questionsRepo(db),
    close: () => db.close(),
  };
}
```

- [ ] **Step 4: 라우트 구현 (repo만 사용, SQL 금지)**

`server/src/routes/categories.js`:

```js
export async function categoriesRoutes(app) {
  const repo = app.repos.categories;

  app.get('/api/categories', async (req) => repo.list(req.query.type));

  app.post('/api/categories', async (req, reply) => {
    const { type, name, sort_order = 0 } = req.body ?? {};
    if (!['survey', 'roleplay'].includes(type) || !name?.trim())
      return reply.code(400).send({ error: 'type(survey|roleplay)과 name은 필수입니다' });
    return reply.code(201).send(repo.create({ type, name: name.trim(), sort_order }));
  });

  app.put('/api/categories/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { name = row.name, sort_order = row.sort_order } = req.body ?? {};
    return repo.update(row.id, { name, sort_order });
  });

  app.delete('/api/categories/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
```

`server/src/routes/questions.js`:

```js
export async function questionsRoutes(app) {
  const repo = app.repos.questions;

  app.get('/api/questions', async (req) => repo.list(req.query.category_id));

  app.post('/api/questions', async (req, reply) => {
    const { category_id, text, note = null } = req.body ?? {};
    if (!category_id || !text?.trim()) return reply.code(400).send({ error: 'category_id와 text는 필수입니다' });
    return reply.code(201).send(repo.create({ category_id, text: text.trim(), note }));
  });

  app.put('/api/questions/:id', async (req, reply) => {
    const row = repo.get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    const { text = row.text, note = row.note, category_id = row.category_id } = req.body ?? {};
    return repo.update(row.id, { text, note, category_id });
  });

  app.delete('/api/questions/:id', async (req, reply) => {
    repo.remove(req.params.id);
    return reply.code(204).send();
  });
}
```

`server/src/app.js`의 `app.get('/api/health', ...)` 아래에 등록:

```js
import { categoriesRoutes } from './routes/categories.js';
import { questionsRoutes } from './routes/questions.js';
// buildApp 안:
await app.register(categoriesRoutes);
await app.register(questionsRoutes);
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd server && npm test`
Expected: PASS (health 포함 전부)

- [ ] **Step 6: 커밋**

```bash
git add server/
git commit -m "feat(stage-02): add category and question crud api"
```

## 사용자 수동 검증

```bash
cd server && npm run dev
curl -X POST localhost:3000/api/categories -H "content-type: application/json" -d "{\"type\":\"survey\",\"name\":\"조깅\"}"
curl -X POST localhost:3000/api/questions -H "content-type: application/json" -d "{\"category_id\":1,\"text\":\"Tell me about your jogging routine.\"}"
curl localhost:3000/api/questions            # 등록한 문항이 보이면 성공
# 서버 재시작 후 curl localhost:3000/api/questions — 데이터가 유지되면 성공 (data/opict.db 영속)
```
