import { transcribe } from '../stt/whisper.js';
import { runCli } from '../ai/runner.js';
import { lenientJson } from '../ai/parse.js';
import { buildEvalPrompt } from '../ai/prompts.js';

export async function runAttempt(repos, id) {
  const row = repos.attempts.get(id);
  try {
    repos.attempts.setStatus(id, { status: 'transcribing' });
    const transcript = await transcribe(row.audio_path).catch((e) => {
      throw new Error(`STT 실패: ${e.message}`);
    });
    repos.attempts.setStatus(id, { status: 'evaluating', transcript });

    const question = repos.questions.get(row.question_id);
    let raw;
    try {
      raw = await runCli({ cli: row.cli, model: row.model, prompt: buildEvalPrompt(question.text, transcript) });
    } catch (e) {
      repos.attempts.setStatus(id, {
        status: 'error',
        raw_output: e.rawOutput || null,
        error_message: `CLI 실행 실패: ${e.message}`,
      });
      return;
    }
    const parsed = lenientJson(raw);
    if (!parsed) {
      repos.attempts.setStatus(id, { status: 'error', raw_output: raw, error_message: 'JSON 파싱 실패 — 원문 보기를 확인하세요' });
      return;
    }
    repos.attempts.setStatus(id, { status: 'done', result_json: JSON.stringify(parsed), raw_output: raw });
  } catch (e) {
    repos.attempts.setStatus(id, { status: 'error', error_message: e.message });
  }
}
