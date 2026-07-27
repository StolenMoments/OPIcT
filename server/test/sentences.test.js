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
