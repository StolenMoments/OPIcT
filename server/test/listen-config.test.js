import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getListenConfig } from '../src/listen-config.js';

test('listen config defaults to the public local server contract', () => {
  assert.deepEqual(getListenConfig({}), {
    port: 3000,
    host: '0.0.0.0',
  });
});

test('listen config reads port and host from the environment', () => {
  assert.deepEqual(getListenConfig({ PORT: '3001', HOST: '127.0.0.1' }), {
    port: 3001,
    host: '127.0.0.1',
  });
});
