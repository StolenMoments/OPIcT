import { homedir } from 'node:os';
import { join } from 'node:path';

// CLI 어댑터 테이블 — 모델 ID·플래그·실행 파일 경로가 바뀌면 이 파일만 고친다.
//
// bin(): 실행 파일 후보를 우선순위대로. runner가 처음 존재하는 것을 쓰고, 없으면 마지막 값을 그대로 쓴다.
//   .cmd 배치 래퍼는 exit code·stdin 전달이 어긋나므로 .exe 를 먼저 찾는다(drillup에서 검증된 방식).
// promptMode:
//   'stdin' — 프롬프트를 stdin으로 넘기고 즉시 닫는다(agy Windows hang 대응).
//   'argv'  — 프롬프트를 인자로 넘긴다. 셸을 거치지 않으므로 따옴표·개행이 원문 그대로 전달된다.
// argv(): 실행 파일 뒤에 붙는 인자만. 명령 자체는 bin()이 정한다.

const win = process.platform === 'win32';
const home = () => homedir();
const localAppData = () => process.env.LOCALAPPDATA ?? join(home(), 'AppData', 'Local');
const npmModules = () => join(home(), 'AppData', 'Roaming', 'npm', 'node_modules');
const codexVendor = (triple, arch) =>
  join(npmModules(), '@openai', 'codex', 'node_modules', '@openai',
    `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe');

export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-sonnet-5'],
    promptMode: 'stdin',
    bin: () => win
      ? [join(home(), '.local', 'bin', 'claude.exe'),
         join(npmModules(), '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
         'claude.cmd']
      : [join(home(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', 'claude'],
    // --system-prompt로 Claude Code 기본 에이전트 시스템 프롬프트(툴 설명 등, 매 호출마다
    // 캐시 미스로 수천 토큰 낭비)를 대체 — 실제 지시문은 prompts.js의 프롬프트 본문에 이미 있다.
    argv: (model) => ['--model', model, '--effort', 'medium', '--output-format', 'json',
      '--disallowedTools', '*', '--system-prompt', '', '-p'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.6-luna'],
    promptMode: 'stdin',
    bin: () => win
      ? [codexVendor('x86_64-pc-windows-msvc', 'x64'),
         codexVendor('aarch64-pc-windows-msvc', 'arm64'),
         'codex.cmd']
      : [join(home(), '.local', 'bin', 'codex'), '/usr/local/bin/codex', 'codex'],
    // -c 값의 따옴표는 codex의 TOML 파서가 요구한다. 셸을 거치지 않아야 그대로 도착한다.
    argv: (model) => ['exec', '--model', model, '-c', 'model_reasoning_effort="high"',
      '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3.6-flash'],
    promptMode: 'argv',
    bin: () => win
      ? [join(localAppData(), 'agy', 'bin', 'agy.exe'),
         join(home(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe'),
         'agy.exe']
      : [join(home(), '.local', 'bin', 'agy'), '/usr/local/bin/agy', 'agy'],
    argv: (model, prompt) => ['-p', prompt, '--model', model, '--effort', 'low'],
    extract: (stdout) => stdout,
  },
};
