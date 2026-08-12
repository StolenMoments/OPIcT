import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { CLIS } from '../src/ai/clis.js';
import { buildInvocation } from '../src/ai/runner.js';
import { evaluationResultSchema } from '../src/ai/schemas.js';

test('CLI별 effort로 호출된다', () => {
  const claude = CLIS.claude.argv(CLIS.claude.models[0]);
  assert.deepEqual(claude.slice(claude.indexOf('--effort'), claude.indexOf('--effort') + 2),
    ['--effort', 'medium']);

  const codex = CLIS.codex.argv(CLIS.codex.models[0]);
  assert.ok(codex.includes('model_reasoning_effort="high"'), codex.join(' '));

  const agy = CLIS.agy.argv(CLIS.agy.models[0], 'x');
  assert.deepEqual(agy.slice(agy.indexOf('--effort'), agy.indexOf('--effort') + 2),
    ['--effort', 'low']);
});

test('실행 파일은 .cmd 래퍼보다 .exe 후보를 먼저 쓴다', () => {
  for (const [name, def] of Object.entries(CLIS)) {
    const candidates = def.bin();
    assert.ok(candidates.length > 1, name);
    assert.ok(!/\.(cmd|bat)$/i.test(candidates[0]), `${name}: ${candidates[0]}`);
  }
});

test('셸은 .cmd 래퍼로 떨어졌을 때만 켠다', () => {
  for (const cli of Object.keys(CLIS)) {
    const inv = buildInvocation({ cli, model: CLIS[cli].models[0], prompt: 'p' });
    assert.equal(inv.opts.shell, /\.(cmd|bat)$/i.test(inv.cmd), `${cli}: ${inv.cmd}`);
  }
});

test('agy는 프롬프트를 -p 인자로 원문 그대로 받고 stdin으로는 보내지 않는다', () => {
  const prompt = 'line one\nsays "quoted" & more';
  const inv = buildInvocation({ cli: 'agy', model: 'gemini-3.6-flash', prompt });
  assert.equal(inv.stdinPrompt, null);
  // 따옴표·개행이 든 프롬프트가 하나의 인자로 온전히 들어가야 한다.
  assert.equal(inv.args[inv.args.indexOf('-p') + 1], prompt);
  assert.equal(inv.args[inv.args.indexOf('--model') + 1], 'gemini-3.6-flash');
  // 셸을 거치면 인자 경계가 깨지므로 agy는 .exe로 해석돼 셸 없이 실행돼야 한다.
  assert.ok(!inv.opts.shell, JSON.stringify(inv.opts));
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

test('Claude receives the native JSON schema option', () => {
  const inv = buildInvocation({
    cli: 'claude',
    model: CLIS.claude.models[0],
    prompt: 'p',
    outputSchema: evaluationResultSchema,
  });
  const index = inv.args.indexOf('--json-schema');

  assert.notEqual(index, -1);
  assert.deepEqual(JSON.parse(inv.args[index + 1]), evaluationResultSchema);
});

test('Codex receives an absolute output schema file', () => {
  const inv = buildInvocation({
    cli: 'codex',
    model: CLIS.codex.models[0],
    prompt: 'p',
    outputSchema: evaluationResultSchema,
  });
  const index = inv.args.indexOf('--output-schema');

  assert.notEqual(index, -1);
  assert.ok(isAbsolute(inv.args[index + 1]));
});

test('Antigravity does not receive a native schema option', () => {
  const inv = buildInvocation({
    cli: 'agy',
    model: CLIS.agy.models[0],
    prompt: 'p',
    outputSchema: evaluationResultSchema,
  });

  assert.ok(!inv.args.includes('--json-schema'));
  assert.ok(!inv.args.includes('--output-schema'));
});

test('Claude result envelopes normalize string and object results to JSON input', () => {
  const objectResult = CLIS.claude.extract(JSON.stringify({ result: { ...evaluationResultSchema } }));
  const stringResult = CLIS.claude.extract(JSON.stringify({ result: JSON.stringify({ ok: true }) }));

  assert.equal(typeof objectResult, 'string');
  assert.deepEqual(JSON.parse(objectResult), evaluationResultSchema);
  assert.deepEqual(JSON.parse(stringResult), { ok: true });
});
