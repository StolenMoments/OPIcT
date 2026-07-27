import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLIS } from './clis.js';

// CLI가 프로젝트 파일을 읽지 못하도록 빈 샌드박스 폴더에서 실행
const sandbox = join(tmpdir(), 'opict-sandbox');
mkdirSync(sandbox, { recursive: true });

export function runCli({ cli, model, prompt, timeoutMs = 180_000 }) {
  const def = CLIS[cli];
  if (!def) return Promise.reject(new Error(`알 수 없는 CLI: ${cli}`));
  const stub = process.env.OPICT_CLI_STUB;
  const [cmd, ...args] = stub ? [process.execPath, stub] : def.argv(model);

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: sandbox, shell: !stub && process.platform === 'win32' });
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
    child.stdin.write(prompt);
    child.stdin.end(); // agy Windows hang 대응 — 반드시 즉시 닫기
  });
}
