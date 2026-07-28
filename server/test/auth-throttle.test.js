import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoginThrottle } from '../src/auth/throttle.js';

test('login throttle locks an IP after repeated failures and resets on success', () => {
  const throttle = createLoginThrottle({ maxFailures: 2, windowMs: 60_000, lockoutMs: 120_000 });
  const client = '198.51.100.10';

  assert.equal(throttle.check(client, 0).locked, false);
  throttle.recordFailure(client, 0);
  throttle.recordFailure(client, 1);
  assert.equal(throttle.check(client, 2).locked, true);
  assert.ok(throttle.check(client, 2).retryAfterMs >= 119_999);

  throttle.recordSuccess(client);
  assert.equal(throttle.check(client, 3).locked, false);
});
