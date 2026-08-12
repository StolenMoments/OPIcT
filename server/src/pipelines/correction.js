import { runValidatedStage, combineRawOutputs } from '../ai/validated.js';
import { correctionResultSchema } from '../ai/schemas.js';
import {
  buildCorrectionPrompt,
  buildCorrectionRepairPrompt,
  buildCorrectionVerificationPrompt,
} from '../ai/prompts.js';

function formatValidationFailure(phase, error) {
  return `${phase} JSON 파싱 실패 또는 Schema 검증 실패 — 자동 재시도 실패 (${error}) — 원문 보기를 확인하세요`;
}

export async function runCorrection(repos, id) {
  const row = repos.corrections.get(id);
  repos.corrections.setStatus(id, { status: 'running', error_message: null });
  let initialRaw = null;

  try {
    const initial = await runValidatedStage({
      cli: row.cli,
      model: row.model,
      prompt: buildCorrectionPrompt(row.input_text),
      repairPrompt: (error, failedRaw) => buildCorrectionRepairPrompt(row.input_text, error, failedRaw),
      outputSchema: correctionResultSchema,
      phase: '1차',
    });
    initialRaw = initial.rawOutput;
    if (!initial.ok) {
      repos.corrections.setStatus(id, {
        status: 'error',
        result_json: null,
        raw_output: initial.rawOutput,
        error_message: formatValidationFailure('1차 결과', initial.error),
      });
      return;
    }

    repos.corrections.setStatus(id, { status: 'verifying', error_message: null });
    const verified = await runValidatedStage({
      cli: row.cli,
      model: row.model,
      prompt: buildCorrectionVerificationPrompt(row.input_text, initial.value),
      repairPrompt: (error, failedRaw) => buildCorrectionRepairPrompt(row.input_text, error, failedRaw),
      outputSchema: correctionResultSchema,
      phase: '검증',
    });
    const rawOutput = combineRawOutputs(initial.rawOutput, verified.rawOutput);
    if (!verified.ok) {
      repos.corrections.setStatus(id, {
        status: 'error',
        result_json: null,
        raw_output: rawOutput,
        error_message: formatValidationFailure('결과 검증', verified.error),
      });
      return;
    }

    repos.corrections.setStatus(id, {
      status: 'done',
      result_json: JSON.stringify(verified.value),
      raw_output: rawOutput,
      error_message: null,
    });
  } catch (error) {
    repos.corrections.setStatus(id, {
      status: 'error',
      result_json: null,
      raw_output: combineRawOutputs(initialRaw, error.rawOutput),
      error_message: `${error.phase === '검증' ? '결과 검증' : error.phase ?? '1차'} CLI 실행 실패: ${error.message}`,
    });
  }
}
