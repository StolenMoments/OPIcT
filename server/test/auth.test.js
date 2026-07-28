import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';

const auth = {
  passwordHash: hashPassword('correct-password'),
  sessionSecret: 'test-session-secret',
};

test('production auth configuration is required when auth is enabled', async () => {
  await assert.rejects(
    buildApp({ dbFile: ':memory:', auth: { passwordHash: '', sessionSecret: '' } }),
    /OPICT_APP_PASSWORD_HASH.*OPICT_SESSION_SECRET/,
  );
});

test('unauthenticated API access is rejected while health stays public', async (t) => {
  const app = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => app.close());

  const health = await app.inject({ method: 'GET', url: '/api/health' });
  const protectedResponse = await app.inject({ method: 'GET', url: '/api/categories' });

  assert.equal(health.statusCode, 200);
  assert.equal(protectedResponse.statusCode, 401);
  assert.deepEqual(protectedResponse.json(), { error: '로그인이 필요합니다' });
});

test('malformed session cookies are treated as unauthenticated', async (t) => {
  const app = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/categories',
    headers: { cookie: 'opict_session=%E0%A4%A' },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: '로그인이 필요합니다' });
});

test('login sets a secure session cookie and permits protected API access', async (t) => {
  const app = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => app.close());

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'correct-password' },
  });
  const cookie = login.headers['set-cookie'];
  const categories = await app.inject({
    method: 'GET',
    url: '/api/categories',
    headers: { cookie },
  });

  assert.equal(login.statusCode, 200);
  assert.match(cookie, /opict_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=31536000/);
  assert.equal(categories.statusCode, 200);
});

test('invalid login is rate limited after repeated failures', async (t) => {
  const app = await buildApp({ dbFile: ':memory:', auth });
  t.after(() => app.close());

  for (let i = 0; i < 5; i += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong-password' },
      remoteAddress: '198.51.100.20',
    });
    assert.equal(response.statusCode, 401);
  }

  const locked = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'wrong-password' },
    remoteAddress: '198.51.100.20',
  });
  assert.equal(locked.statusCode, 429);
  assert.ok(locked.headers['retry-after']);
});
