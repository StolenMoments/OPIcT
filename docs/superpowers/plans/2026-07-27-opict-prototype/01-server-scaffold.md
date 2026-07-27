# Task 01: 서버 스캐폴드 + DB 스키마 + 헬스체크

**Files:**
- Create: `server/package.json`, `server/src/server.js`, `server/src/app.js`, `server/src/db.js`, `server/src/schema.sql`, `server/src/repo/index.js`, `server/test/health.test.js`, `.gitignore`(수정)

**Interfaces (Produces):**
- `createDb(file: string)` → DB 커넥션(현재 better-sqlite3, 스키마 적용·pragma 설정 완료). **`db.js`·`schema.sql`·`repo/` 밖에서는 이 커넥션을 직접 만지지 않는다** — MariaDB 전환 대비.
- `createRepos(db)` → `{ categories, questions, sentences, corrections, attempts, settings }` repo 묶음. 이번 작업에서는 빈 객체 골격만 만들고, 각 repo는 해당 기능 작업에서 채운다.
- `buildApp({ dbFile }): Promise<FastifyInstance>` — 라우트는 `app.repos`로만 데이터 접근. (`app.db`는 노출하지 않음)
- `GET /api/health` → `200 {"ok":true}`
- npm scripts: `npm run dev`(서버 기동), `npm test`(node:test)

- [ ] **Step 1: 프로젝트 초기화**

```bash
mkdir server && cd server
npm init -y
npm i fastify better-sqlite3 @fastify/static @fastify/multipart
```

`server/package.json`에 다음을 설정:

```json
{
  "name": "opict-server",
  "type": "module",
  "scripts": {
    "dev": "node src/server.js",
    "test": "node --test test/"
  }
}
```

루트 `.gitignore`에 추가(없는 줄만): `node_modules/`, `server/data/`, `web/dist/`, `.env`

- [ ] **Step 2: 실패하는 테스트 작성** — `server/test/health.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('GET /api/health returns ok', async () => {
  const app = await buildApp({ dbFile: ':memory:' });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  await app.close();
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd server && npm test`
Expected: FAIL (`Cannot find module '../src/app.js'`)

- [ ] **Step 4: 스키마 작성** — `server/src/schema.sql` (spec §4 그대로, 6개 테이블)

```sql
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('survey','roleplay')),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  transcript TEXT,
  cli TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  result_json TEXT,
  raw_output TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_text TEXT NOT NULL,
  cli TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  raw_output TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  text_en TEXT NOT NULL,
  memo TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','correction')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 5: db.js / app.js / server.js 구현**

`server/src/db.js`:

```js
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

export function createDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return db;
}
```

`server/src/repo/index.js` (골격 — 각 repo는 해당 기능 작업에서 추가):

```js
export function createRepos(db) {
  return {
    close: () => db.close(),
  };
}
```

`server/src/app.js`:

```js
import Fastify from 'fastify';
import { createDb } from './db.js';
import { createRepos } from './repo/index.js';

export async function buildApp({ dbFile = 'data/opict.db', logger = false } = {}) {
  const app = Fastify({ logger });
  app.decorate('repos', createRepos(createDb(dbFile)));
  app.get('/api/health', async () => ({ ok: true }));
  app.addHook('onClose', async () => app.repos.close());
  return app;
}
```

`server/src/server.js`:

```js
import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';

mkdirSync('data/uploads', { recursive: true });
const app = await buildApp({ logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd server && npm test`
Expected: PASS (1 test)

- [ ] **Step 7: 커밋**

```bash
git add .gitignore server/
git commit -m "feat(stage-01): scaffold fastify server with sqlite schema"
```

## 사용자 수동 검증

```bash
cd server && npm run dev
# 다른 터미널에서:
curl http://localhost:3000/api/health   # → {"ok":true}
# server/data/opict.db 파일이 생성되었는지 확인
```
