import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaginationQuery } from '../src/routes/pagination.js';
import { escapeLikeContains } from '../src/repo/search.js';

test('normalizes history pagination query defaults and bounds', () => {
  assert.deepEqual(parsePaginationQuery({}), { limit: 10, offset: 0, search: '' });
  assert.deepEqual(
    parsePaginationQuery({ limit: '50', offset: '-3', search: '  park  ' }),
    { limit: 10, offset: 0, search: 'park' },
  );
  assert.deepEqual(
    parsePaginationQuery({ limit: '5', offset: '10', search: '' }),
    { limit: 5, offset: 10, search: '' },
  );
});

test('escapes literal LIKE wildcard characters in a contains pattern', () => {
  assert.equal(escapeLikeContains('100%_\\done'), '%100\\%\\_\\\\done%');
});
