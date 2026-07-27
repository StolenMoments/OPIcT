export const CLIS = {
  claude: {
    label: 'Claude Code',
    models: ['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    argv: (model) => ['claude', '-p', '--model', model, '--output-format', 'json',
      '--disallowedTools', '*', '--no-session'],
    // claude는 {result: "..."} 봉투로 출력 → result만 꺼냄. 실패 시 원문 그대로.
    extract: (stdout) => { try { return JSON.parse(stdout).result ?? stdout; } catch { return stdout; } },
  },
  codex: {
    label: 'Codex CLI',
    models: ['gpt-5.2-codex', 'gpt-5.2', 'o5-mini'],
    argv: (model) => ['codex', 'exec', '-m', model, '--skip-git-repo-check', '-'],
    extract: (stdout) => stdout,
  },
  agy: {
    label: 'Antigravity CLI',
    models: ['gemini-3-pro', 'gemini-3-flash'],
    argv: (model) => ['agy', '-p', '--model', model],
    extract: (stdout) => stdout,
  },
};
