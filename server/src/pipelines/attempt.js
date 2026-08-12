import { transcribe } from '../stt/whisper.js';
import { runValidatedStage, combineRawOutputs } from '../ai/validated.js';
import { evaluationResultSchema } from '../ai/schemas.js';
import {
  buildEvalPrompt,
  buildEvalRepairPrompt,
  buildEvalVerificationPrompt,
} from '../ai/prompts.js';

function formatValidationFailure(phase, error) {
  return `${phase} JSON 파싱 실패 또는 Schema 검증 실패 — 자동 재시도 실패 (${error}) — 원문 보기를 확인하세요`;
}

async function evaluateAttempt(repos, id, transcript) {
  const row = repos.attempts.get(id);
  const question = repos.questions.get(row.question_id);
  let initialRaw = null;
  try {
    const initial = await runValidatedStage({
      cli: row.cli,
      model: row.model,
      prompt: buildEvalPrompt(question.text, transcript),
      repairPrompt: (error, failedRaw) => buildEvalRepairPrompt(question.text, transcript, error, failedRaw),
      outputSchema: evaluationResultSchema,
      phase: '1차',
    });
    initialRaw = initial.rawOutput;
    if (!initial.ok) {
      repos.attempts.setStatus(id, {
        status: 'error',
        result_json: null,
        raw_output: initial.rawOutput,
        error_message: formatValidationFailure('1차 결과', initial.error),
      });
      return;
    }

    repos.attempts.setStatus(id, { status: 'verifying', error_message: null });
    const verified = await runValidatedStage({
      cli: row.cli,
      model: row.model,
      prompt: buildEvalVerificationPrompt(question.text, transcript, initial.value),
      repairPrompt: (error, failedRaw) => buildEvalRepairPrompt(question.text, transcript, error, failedRaw),
      outputSchema: evaluationResultSchema,
      phase: '검증',
    });
    const rawOutput = combineRawOutputs(initial.rawOutput, verified.rawOutput);
    if (!verified.ok) {
      repos.attempts.setStatus(id, {
        status: 'error',
        result_json: null,
        raw_output: rawOutput,
        error_message: formatValidationFailure('결과 검증', verified.error),
      });
      return;
    }

    repos.attempts.setStatus(id, {
      status: 'done',
      result_json: JSON.stringify(verified.value),
      raw_output: rawOutput,
      error_message: null,
    });
  } catch (error) {
    repos.attempts.setStatus(id, {
      status: 'error',
      result_json: null,
      raw_output: combineRawOutputs(initialRaw, error.rawOutput),
      error_message: `${error.phase === '검증' ? '결과 검증' : error.phase ?? '1차'} CLI 실행 실패: ${error.message}`,
    });
  }
}

export async function runAttempt(repos, id) {
  const row = repos.attempts.get(id);
  try {
    let transcript = row.transcript;
    if (row.audio_path) {
      repos.attempts.setStatus(id, { status: 'transcribing', error_message: null });
      transcript = await transcribe(row.audio_path).catch((e) => {
        throw new Error(`STT 실패: ${e.message}`);
      });
      repos.attempts.setStatus(id, { status: 'evaluating', transcript, error_message: null });
    }
    await evaluateAttempt(repos, id, transcript);
  } catch (e) {
    repos.attempts.setStatus(id, { status: 'error', result_json: null, error_message: e.message });
  }
}
