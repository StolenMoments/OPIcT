import { transcribe } from '../stt/whisper.js';
import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildEvalPrompt, buildEvalVerificationPrompt } from '../ai/prompts.js';

async function evaluateAttempt(repos, id, transcript) {
  const row = repos.attempts.get(id);
  const question = repos.questions.get(row.question_id);
  let initialRaw;
  try {
    initialRaw = await runCli({ cli: row.cli, model: row.model, prompt: buildEvalPrompt(question.text, transcript) });
  } catch (e) {
    repos.attempts.setStatus(id, {
      status: 'error',
      raw_output: e.rawOutput || null,
      error_message: `CLI 실행 실패: ${e.message}`,
    });
    return;
  }
  const initial = lenientJson(initialRaw);
  if (!initial) {
    repos.attempts.setStatus(id, { status: 'error', raw_output: initialRaw, error_message: '1차 결과 JSON 파싱 실패 — 원문 보기를 확인하세요' });
    return;
  }
  repos.attempts.setStatus(id, { status: 'verifying' });
  let verifiedRaw;
  try {
    verifiedRaw = await runCli({
      cli: row.cli,
      model: row.model,
      prompt: buildEvalVerificationPrompt(question.text, transcript, initial),
    });
  } catch (e) {
    repos.attempts.setStatus(id, {
      status: 'error',
      raw_output: e.rawOutput || null,
      error_message: `결과 검증 CLI 실행 실패: ${e.message}`,
    });
    return;
  }
  const verified = lenientJson(verifiedRaw);
  if (!verified) {
    repos.attempts.setStatus(id, { status: 'error', raw_output: verifiedRaw, error_message: '결과 검증 JSON 파싱 실패 — 원문 보기를 확인하세요' });
    return;
  }
  repos.attempts.setStatus(id, { status: 'done', result_json: JSON.stringify(verified), raw_output: verifiedRaw });
}

export async function runAttempt(repos, id) {
  const row = repos.attempts.get(id);
  try {
    let transcript = row.transcript;
    if (row.audio_path) {
      repos.attempts.setStatus(id, { status: 'transcribing' });
      transcript = await transcribe(row.audio_path).catch((e) => {
        throw new Error(`STT 실패: ${e.message}`);
      });
      repos.attempts.setStatus(id, { status: 'evaluating', transcript });
    }
    await evaluateAttempt(repos, id, transcript);
  } catch (e) {
    repos.attempts.setStatus(id, { status: 'error', error_message: e.message });
  }
}
