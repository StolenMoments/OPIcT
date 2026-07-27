import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lenientJson } from '../src/ai/parse.js';

test('plain json', () => {
  assert.deepEqual(lenientJson('{"a":1}'), { a: 1 });
});
test('json in code fence', () => {
  assert.deepEqual(lenientJson('Here:\n```json\n{"a":1}\n```\ndone'), { a: 1 });
});
test('json with surrounding prose', () => {
  assert.deepEqual(lenientJson('Sure! {"a":{"b":2}} hope it helps'), { a: { b: 2 } });
});
test('no json returns null', () => {
  assert.equal(lenientJson('no json here'), null);
});
test('bare json array is rejected, not treated as a successful parse', () => {
  assert.equal(lenientJson('[1,2,3]'), null);
});
