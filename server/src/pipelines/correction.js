import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildCorrectionPrompt, buildCorrectionVerificationPrompt } from '../ai/prompts.js';

export async function runCorrection(repos, id) {
  const row = repos.corrections.get(id);
  repos.corrections.setStatus(id, { status: 'running' });
  let phase = '1차';
  try {
    const initialRaw = await runCli({ cli: row.cli, model: row.model, prompt: buildCorrectionPrompt(row.input_text) });
    const initial = lenientJson(initialRaw);
    if (!initial) {
      repos.corrections.setStatus(id, { status: 'error', raw_output: initialRaw, error_message: '1차 결과 JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.corrections.setStatus(id, { status: 'verifying' });
    phase = '결과 검증';
    const verifiedRaw = await runCli({
      cli: row.cli,
      model: row.model,
      prompt: buildCorrectionVerificationPrompt(row.input_text, initial),
    });
    const verified = lenientJson(verifiedRaw);
    if (!verified) {
      repos.corrections.setStatus(id, { status: 'error', raw_output: verifiedRaw, error_message: '결과 검증 JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.corrections.setStatus(id, { status: 'done', result_json: JSON.stringify(verified), raw_output: verifiedRaw });
  } catch (e) {
    repos.corrections.setStatus(id, {
      status: 'error',
      raw_output: e.rawOutput || null,
      error_message: `${phase} CLI 실행 실패: ${e.message}`,
    });
  }
}
