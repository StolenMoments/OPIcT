export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-sonnet-5'],
    argv: (model) => ['claude', '-p', '--model', model, '--output-format', 'json',
      '--disallowedTools', '*', '--no-session'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.6-luna'],
    argv: (model) => ['codex', 'exec', '-m', model, '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3.6-flash'],
    argv: (model) => ['agy', '-p', '--model', model],
    extract: (stdout) => stdout,
  },
};
