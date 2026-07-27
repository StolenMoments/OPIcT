import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIS } from '../src/ai/clis.js';
import { buildInvocation } from '../src/ai/runner.js';

test('모든 CLI가 effort low로 호출된다', () => {
  const claude = CLIS.claude.argv(CLIS.claude.models[0]);
  assert.deepEqual(claude.slice(claude.indexOf('--effort'), claude.indexOf('--effort') + 2),
    ['--effort', 'low']);

  const codex = CLIS.codex.argv(CLIS.codex.models[0]);
  assert.ok(codex.includes('model_reasoning_effort="low"'), codex.join(' '));

  const agy = CLIS.agy.argv(CLIS.agy.models[0], 'x');
  assert.deepEqual(agy.slice(agy.indexOf('--effort'), agy.indexOf('--effort') + 2),
    ['--effort', 'low']);
});

test('agy는 프롬프트를 -p 인자로 받고 stdin으로는 보내지 않는다', () => {
  const inv = buildInvocation({ cli: 'agy', model: 'gemini-3.6-flash', prompt: 'line one\nline two' });
  assert.equal(inv.stdinPrompt, null);
  const flat = 'line one line two'; // 명령줄에는 개행을 실을 수 없어 공백으로 접는다
  assert.ok(JSON.stringify(inv.args).includes(flat), JSON.stringify(inv.args));
  assert.ok(JSON.stringify(inv.args).includes('gemini-3.6-flash'));
});

test('stdin 방식 CLI는 프롬프트를 원문 그대로 stdin으로 보낸다', () => {
  const prompt = 'line one\nline two';
  for (const cli of ['claude', 'codex']) {
    const inv = buildInvocation({ cli, model: CLIS[cli].models[0], prompt });
    assert.equal(inv.stdinPrompt, prompt, cli);
    assert.ok(!JSON.stringify(inv.args).includes('line one'), cli);
  }
});

test('스텁이 설정되면 어떤 CLI든 stdin 방식으로 실행된다', () => {
  const inv = buildInvocation({ cli: 'agy', model: 'gemini-3.6-flash', prompt: 'p', stub: '/tmp/stub.js' });
  assert.equal(inv.cmd, process.execPath);
  assert.deepEqual(inv.args, ['/tmp/stub.js']);
  assert.equal(inv.stdinPrompt, 'p');
});
