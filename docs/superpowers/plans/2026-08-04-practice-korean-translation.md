# Practice Korean Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the practice evaluation prompt translate Korean answer segments into English in the existing `corrected_answer` result.

**Architecture:** Keep the existing JSON contract and UI unchanged. Add one explicit instruction to `buildEvalPrompt` and cover the prompt contract with one focused server unit test.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`.

## Global Constraints

- Keep the test scope minimal: one prompt-contract test.
- Preserve the existing `corrected_answer` field and JSON response shape.
- Do not add a translation API, preprocessing stage, or UI field.

---

### Task 1: Extend the practice evaluation prompt

**Files:**
- Create: `server/test/prompts.test.js`
- Modify: `server/src/ai/prompts.js:13-25`

**Interfaces:**
- Consumes: `buildEvalPrompt(questionText: string, transcript: string): string`.
- Produces: A prompt that explicitly requires Korean sentence or phrase segments in the transcript to be translated into natural English within `corrected_answer`, with no Korean left in that field.

- [ ] **Step 1: Write the failing test**

Add one focused test:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvalPrompt } from '../src/ai/prompts.js';

test('evaluation prompt translates Korean segments in corrected_answer', () => {
  const prompt = buildEvalPrompt('Tell me about your day.', 'I stayed 집에 all day.');

  assert.match(prompt, /Korean.*natural English/i);
  assert.match(prompt, /must not contain Korean/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/test/prompts.test.js`

Expected: FAIL because the current evaluation prompt does not contain either translation requirement.

- [ ] **Step 3: Write the minimal implementation**

In `buildEvalPrompt`, add these instructions next to the existing `corrected_answer` rule:

```js
'If the transcribed answer contains Korean words, phrases or sentences, translate them into natural English in "corrected_answer" while preserving their meaning.',
'"corrected_answer" must not contain Korean; keep the original meaning, structure and length as close as possible.',
```

- [ ] **Step 4: Run the focused test and server tests**

Run: `node --test server/test/prompts.test.js server/test/attempts.test.js`

Expected: PASS with zero failures.

- [ ] **Step 5: Review the diff and commit**

Run: `git diff --check && git status --short`

Then commit only the prompt and focused test:

```bash
git add server/src/ai/prompts.js server/test/prompts.test.js
git commit -m "feat(practice): translate Korean answer segments"
```
