import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { CLIS } from './clis.js';

// CLI가 프로젝트 파일을 읽지 못하도록 빈 샌드박스 폴더에서 실행
const sandbox = join(tmpdir(), 'opict-sandbox');
mkdirSync(sandbox, { recursive: true });
const schemaDir = join(tmpdir(), 'opict-schemas');
mkdirSync(schemaDir, { recursive: true });

const resolved = new Map();

// 존재하는 첫 후보를 고른다. 하나도 없으면 마지막 후보(이름만)를 PATH 탐색에 맡긴다.
function resolveBin(cli, def) {
  if (!resolved.has(cli)) {
    const candidates = def.bin();
    resolved.set(cli, candidates.find(existsSync) ?? candidates.at(-1));
  }
  return resolved.get(cli);
}

function schemaFileFor(schema) {
  if (typeof schema === 'string' && isAbsolute(schema)) return schema;
  const serialized = JSON.stringify(schema);
  const digest = createHash('sha256').update(serialized).digest('hex');
  const file = join(schemaDir, `${digest}.json`);
  if (!existsSync(file)) writeFileSync(file, `${serialized}\n`, 'utf8');
  return file;
}

function normalizeOutput(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  return JSON.stringify(value);
}

/**
 * 실제로 spawn할 명령·인자·옵션을 만든다. 테스트에서 조립 결과만 검증할 수 있도록 분리.
 */
export function buildInvocation({ cli, model, prompt, stub, outputSchema, schema, schemaPath }) {
  if (stub) {
    // 테스트 스텁은 항상 stdin으로 프롬프트를 받는다.
    return { cmd: process.execPath, args: [stub], opts: {}, stdinPrompt: prompt };
  }
  const def = CLIS[cli];
  const cmd = resolveBin(cli, def);
  // 셸은 .cmd/.bat 래퍼로 떨어졌을 때만. 셸을 거치면 인자가 따옴표 없이 이어붙어
  // 프롬프트의 따옴표·개행에서 인자 경계가 깨지고, 프롬프트 내용이 명령줄로 새어나간다.
  const opts = { shell: /\.(cmd|bat)$/i.test(cmd), windowsHide: true };

  const outputSchemaContext = outputSchema ?? schema;
  const resolvedSchemaPath = schemaPath ?? (outputSchemaContext ? schemaFileFor(outputSchemaContext) : undefined);
  const args = def.argv(model, {
    outputSchema: cli === 'claude' ? outputSchemaContext : undefined,
    schemaPath: cli === 'codex' ? resolvedSchemaPath : undefined,
    prompt,
  });

  return def.promptMode === 'argv'
    ? { cmd, args, opts, stdinPrompt: null }
    : { cmd, args, opts, stdinPrompt: prompt };
}

export function runCli({ cli, model, prompt, timeoutMs = 180_000, outputSchema, schema }) {
  const def = CLIS[cli];
  if (!def) return Promise.reject(new Error(`알 수 없는 CLI: ${cli}`));
  const { cmd, args, opts, stdinPrompt } = buildInvocation({
    cli, model, prompt, stub: process.env.OPICT_CLI_STUB, outputSchema, schema,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: sandbox, ...opts });
    let out = '', err = '', settled = false;
    const settleResolve = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const settleReject = (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } };
    const timer = setTimeout(() => {
      child.kill();
      // SIGTERM을 무시하는 프로세스 대응 — 잠시 기다렸다가 강제 종료한다.
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 5000);
      killTimer.unref?.();
      const e = new Error(`CLI 타임아웃 (${timeoutMs / 1000}초)`);
      e.rawOutput = out;
      settleReject(e);
    }, timeoutMs);
    // 한글 응답이 청크 경계에서 잘리지 않도록 스트림 단위로 디코딩한다.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (cause) => {
      const e = new Error(`CLI 실행 파일을 실행할 수 없습니다 (${cmd}): ${cause.message}`, { cause });
      e.rawOutput = out;
      settleReject(e);
    });
    child.stdin.on('error', () => { /* EPIPE 등 — close/error 핸들러가 최종 처리 */ });
    child.on('close', (code) => {
      if (code !== 0) {
        const e = new Error(`CLI 종료코드 ${code}: ${err.slice(0, 500)}`);
        e.rawOutput = out;
        return settleReject(e);
      }
      settleResolve(normalizeOutput(def.extract(out)));
    });
    if (stdinPrompt !== null) child.stdin.write(stdinPrompt, 'utf-8');
    child.stdin.end(); // agy Windows hang 대응 — 반드시 즉시 닫기
  });
}
