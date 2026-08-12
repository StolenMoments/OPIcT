import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSessionItems, reviewAfterOutcome } from '../src/training/policy.js';

test('review selection puts due sentences before unseen sentences and excludes future reviews', () => {
  const selected = selectSessionItems([
    { id: 1, session_count: 1, next_review_on: '2026-08-12' },
    { id: 2, session_count: 0, next_review_on: null },
    { id: 3, session_count: 1, next_review_on: '2026-08-13' },
    { id: 4, session_count: 1, next_review_on: '2026-08-10' },
    { id: 5, session_count: 0, next_review_on: null },
  ], '2026-08-12', 3);

  assert.deepEqual(selected.map(({ id }) => id), [4, 1, 2]);
});

test('two consecutive first-try passes master a sentence and schedule it for 14 days', () => {
  const first = reviewAfterOutcome({ mastery_status: 'learning', first_pass_streak: 0 }, 'first_try_pass', '2026-08-12');
  const second = reviewAfterOutcome(first, 'first_try_pass', '2026-08-15');

  assert.deepEqual(first, {
    mastery_status: 'learning',
    first_pass_streak: 1,
    next_review_on: '2026-08-15',
  });
  assert.deepEqual(second, {
    mastery_status: 'mastered',
    first_pass_streak: 2,
    next_review_on: '2026-08-29',
  });
});

test('a sentence that needed a hint returns the next day and resets first-pass progress', () => {
  assert.deepEqual(
    reviewAfterOutcome({ mastery_status: 'mastered', first_pass_streak: 4 }, 'hint_pass', '2026-08-12'),
    {
      mastery_status: 'learning',
      first_pass_streak: 0,
      next_review_on: '2026-08-13',
    },
  );
});
