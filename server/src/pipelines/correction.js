import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildCorrectionPrompt } from '../ai/prompts.js';

export async function runCorrection(repos, id) {
  const row = repos.corrections.get(id);
  repos.corrections.setStatus(id, { status: 'running' });
  try {
    const raw = await runCli({ cli: row.cli, model: row.model, prompt: buildCorrectionPrompt(row.input_text) });
    const parsed = lenientJson(raw);
    if (!parsed) {
      repos.corrections.setStatus(id, { status: 'error', raw_output: raw, error_message: 'JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.corrections.setStatus(id, { status: 'done', result_json: JSON.stringify(parsed), raw_output: raw });
  } catch (e) {
    repos.corrections.setStatus(id, { status: 'error', error_message: `CLI 실행 실패: ${e.message}` });
  }
}
