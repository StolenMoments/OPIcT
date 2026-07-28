import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

test('password hashes verify without storing the original password', () => {
  const password = 'random-production-password';
  const encoded = hashPassword(password);

  assert.notEqual(encoded, password);
  assert.match(encoded, /^scrypt\$/);
  assert.equal(verifyPassword(password, encoded), true);
  assert.equal(verifyPassword('wrong-password', encoded), false);
});

test('malformed password hashes are rejected', () => {
  assert.equal(verifyPassword('password', 'not-a-scrypt-hash'), false);
});
