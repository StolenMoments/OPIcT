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
