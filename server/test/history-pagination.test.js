import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('GET /api/attempts returns one page and the filtered total', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  const category = app.repos.categories.create({ type: 'survey', name: '일상' });
  const parks = app.repos.questions.create({ category_id: category.id, text: 'Talk about parks' });
  const cooking = app.repos.questions.create({ category_id: category.id, text: 'Describe cooking' });
  for (let index = 0; index < 12; index += 1) {
    app.repos.attempts.create({ question_id: parks.id, cli: 'claude', model: 'm' });
  }
  app.repos.attempts.create({ question_id: cooking.id, cli: 'claude', model: 'm' });

  const response = await app.inject({ url: '/api/attempts?limit=50&offset=10&search=PARK' });

  assert.equal(response.statusCode, 200);
  const page = response.json();
  assert.equal(page.total, 12);
  assert.equal(page.limit, 10);
  assert.equal(page.offset, 10);
  assert.equal(page.items.length, 2);
  assert.deepEqual(page.items.map((item) => item.id), [2, 1]);
  assert.ok(page.items.every((item) => item.question_text === 'Talk about parks'));
});

test('GET /api/corrections searches input text case-insensitively and paginates', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  for (let index = 0; index < 12; index += 1) {
    app.repos.corrections.create({ input_text: `I visited the PARK ${index}`, cli: 'claude', model: 'm' });
  }
  app.repos.corrections.create({ input_text: 'I cooked dinner.', cli: 'claude', model: 'm' });

  const response = await app.inject({ url: '/api/corrections?limit=10&offset=10&search=park' });

  assert.equal(response.statusCode, 200);
  const page = response.json();
  assert.equal(page.total, 12);
  assert.equal(page.limit, 10);
  assert.equal(page.offset, 10);
  assert.equal(page.items.length, 2);
  assert.deepEqual(page.items.map((item) => item.id), [2, 1]);
  assert.ok(page.items.every((item) => item.input_text.includes('PARK')));
});

test('GET /api/corrections treats LIKE wildcards in search as literal text', async (t) => {
  const app = await buildApp({ dbFile: ':memory:' });
  t.after(() => app.close());
  app.repos.corrections.create({ input_text: 'Save 100%_now', cli: 'claude', model: 'm' });
  app.repos.corrections.create({ input_text: 'Save 100AAAnow', cli: 'claude', model: 'm' });

  const response = await app.inject({ url: '/api/corrections?search=100%25_now' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().total, 1);
  assert.deepEqual(response.json().items.map((item) => item.input_text), ['Save 100%_now']);
});
