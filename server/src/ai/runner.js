import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLIS } from './clis.js';

// CLI가 프로젝트 파일을 읽지 못하도록 빈 샌드박스 폴더에서 실행
const sandbox = join(tmpdir(), 'opict-sandbox');
mkdirSync(sandbox, { recursive: true });

// 프롬프트를 인자로 넘기는 CLI(agy)는 명령줄에 개행을 실을 수 없다. 줄을 공백으로 접는다.
const flattenPrompt = (prompt) => String(prompt).replace(/\s*\n\s*/g, ' ').trim();

// cmd.exe 경유 실행용 인용. 셸이 인자를 다시 쪼개지 않도록 우리가 직접 감싼다.
// 주의: cmd.exe는 따옴표 안에서도 %VAR%를 확장하므로, 프롬프트에 %가 들어가면 그대로 넘어가지 않는다.
const quoteForCmd = (arg) => `"${String(arg).replace(/"/g, '""')}"`;

/**
 * 실제로 spawn할 명령·인자·옵션을 만든다. 테스트에서 조립 결과만 검증할 수 있도록 분리.
 */
export function buildInvocation({ cli, model, prompt, stub }) {
  const def = CLIS[cli];
  if (stub) {
    // 테스트 스텁은 항상 stdin으로 프롬프트를 받는다.
    return { cmd: process.execPath, args: [stub], opts: {}, stdinPrompt: prompt };
  }

  if (def.promptMode !== 'argv') {
    const [cmd, ...args] = def.argv(model);
    // Windows에서 CLI들은 .cmd 셈으로 설치되므로 셸을 거쳐야 실행된다.
    return { cmd, args, opts: { shell: process.platform === 'win32' }, stdinPrompt: prompt };
  }

  const parts = def.argv(model, flattenPrompt(prompt));
  if (process.platform !== 'win32') {
    const [cmd, ...args] = parts;
    return { cmd, args, opts: {}, stdinPrompt: null };
  }
  // shell:true는 인자를 그대로 이어붙여 프롬프트가 명령줄로 새어나간다.
  // cmd.exe를 직접 띄우고 인용은 우리가 하되, Node가 다시 손대지 않도록 verbatim으로 넘긴다.
  return {
    cmd: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', `"${parts.map(quoteForCmd).join(' ')}"`],
    opts: { windowsVerbatimArguments: true },
    stdinPrompt: null,
  };
}

export function runCli({ cli, model, prompt, timeoutMs = 180_000 }) {
  const def = CLIS[cli];
  if (!def) return Promise.reject(new Error(`알 수 없는 CLI: ${cli}`));
  const { cmd, args, opts, stdinPrompt } = buildInvocation({
    cli, model, prompt, stub: process.env.OPICT_CLI_STUB,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: sandbox, ...opts });
    let out = '', err = '', settled = false;
    const settleResolve = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const settleReject = (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } };
    const timer = setTimeout(() => {
      child.kill();
      const e = new Error(`CLI 타임아웃 (${timeoutMs / 1000}초)`);
      e.rawOutput = out;
      settleReject(e);
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { e.rawOutput = out; settleReject(e); });
    child.stdin.on('error', () => { /* EPIPE 등 — close/error 핸들러가 최종 처리 */ });
    child.on('close', (code) => {
      if (code !== 0) {
        const e = new Error(`CLI 종료코드 ${code}: ${err.slice(0, 500)}`);
        e.rawOutput = out;
        return settleReject(e);
      }
      settleResolve(def.extract(out));
    });
    if (stdinPrompt !== null) child.stdin.write(stdinPrompt);
    child.stdin.end(); // agy Windows hang 대응 — 반드시 즉시 닫기
  });
}
