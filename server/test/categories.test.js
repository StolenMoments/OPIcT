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

test('PUT with blank name rejected, row unchanged', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await post(app, '/api/categories', { type: 'survey', name: '국내여행' })).json();

  const res = await app.inject({ method: 'PUT', url: `/api/categories/${cat.id}`, payload: { name: '' } });
  assert.equal(res.statusCode, 400);

  const blankSpaces = await app.inject({ method: 'PUT', url: `/api/categories/${cat.id}`, payload: { name: '   ' } });
  assert.equal(blankSpaces.statusCode, 400);

  const stored = await app.inject({ url: `/api/categories?type=survey` });
  assert.equal(stored.json()[0].name, '국내여행');
});

test('PUT omitting name preserves existing value', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const cat = (await post(app, '/api/categories', { type: 'survey', name: '국내여행' })).json();

  const res = await app.inject({ method: 'PUT', url: `/api/categories/${cat.id}`, payload: { sort_order: 5 } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().name, '국내여행');
  assert.equal(res.json().sort_order, 5);
});
