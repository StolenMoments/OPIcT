// CLI 어댑터 테이블 — 모델 ID·플래그가 바뀌면 이 파일만 고친다.
//
// promptMode:
//   'stdin' — 프롬프트를 stdin으로 넘기고 즉시 닫는다(기본, agy Windows hang 대응).
//   'argv'  — 프롬프트를 인자로 넘긴다. runner가 개행을 공백으로 접어서 전달한다.
export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-haiku-4-5-20251001'],
    promptMode: 'stdin',
    argv: (model) => ['claude', '-p', '--model', model, '--effort', 'low',
      '--output-format', 'json', '--disallowedTools', '*', '--no-session'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.6-luna'],
    promptMode: 'stdin',
    argv: (model) => ['codex', 'exec', '-m', model,
      '-c', 'model_reasoning_effort="low"', '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3.6-flash'],
    promptMode: 'argv',
    argv: (model, prompt) => ['agy', '-p', prompt, '--model', model, '--effort', 'low'],
    extract: (stdout) => stdout,
  },
};
