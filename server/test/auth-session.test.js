import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, verifySessionToken } from '../src/auth/session.js';

test('session tokens verify before expiry and reject tampering', () => {
  const now = 1_700_000_000_000;
  const token = createSessionToken('session-secret', now);

  assert.equal(verifySessionToken('session-secret', token, now + 1), true);
  assert.equal(verifySessionToken('wrong-secret', token, now + 1), false);
  assert.equal(verifySessionToken('session-secret', `${token}x`, now + 1), false);
});

test('expired session tokens are rejected', () => {
  const now = 1_700_000_000_000;
  const token = createSessionToken('session-secret', now);

  assert.equal(verifySessionToken('session-secret', token, now + 31 * 24 * 60 * 60 * 1000), false);
});
