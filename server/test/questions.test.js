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

test('PUT questions with blank text rejected', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'roleplay', name: '병원 예약' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'original text' } })).json();

  const res = await app.inject({ method: 'PUT', url: `/api/questions/${q.id}`, payload: { text: '  ' } });
  assert.equal(res.statusCode, 400);
});

test('POST questions with nonexistent category_id rejected with 400, not 500', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const res = await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: 9999, text: 'hello' } });
  assert.equal(res.statusCode, 400);
});

test('PUT questions with nonexistent category_id rejected with 400', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'roleplay', name: '병원 예약' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'original text' } })).json();

  const res = await app.inject({ method: 'PUT', url: `/api/questions/${q.id}`, payload: { category_id: 9999 } });
  assert.equal(res.statusCode, 400);
});

test('PUT questions omitting fields preserves existing values', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await app.inject({ method: 'POST', url: '/api/categories', payload: { type: 'roleplay', name: '병원 예약' } })).json();
  const q = (await app.inject({ method: 'POST', url: '/api/questions', payload: { category_id: cat.id, text: 'original text', note: 'note1' } })).json();

  const res = await app.inject({ method: 'PUT', url: `/api/questions/${q.id}`, payload: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().text, 'original text');
  assert.equal(res.json().note, 'note1');
  assert.equal(res.json().category_id, cat.id);
});
