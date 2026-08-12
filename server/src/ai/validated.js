import { runCli } from './runner.js';
import { parseAndValidateJson } from './parse.js';

const RETRIES_PER_STAGE = 1;

function outputText(raw) {
  if (typeof raw === 'string') return raw;
  if (raw === undefined || raw === null) return '';
  return JSON.stringify(raw);
}

export function combineRawOutputs(...parts) {
  const nonEmpty = parts.flat().filter((part) => typeof part === 'string' && part.length > 0);
  return nonEmpty.length > 0 ? nonEmpty.join('\n\n') : null;
}

function labelledOutput(records) {
  return combineRawOutputs(records.map(({ label, raw }) => `[${label}]\n${outputText(raw)}`));
}

/** Run one model stage, allowing one format-only repair retry. */
export async function runValidatedStage({
  cli,
  model,
  prompt,
  repairPrompt,
  outputSchema,
  phase,
}) {
  const records = [];
  let currentPrompt = prompt;

  for (let attempt = 0; attempt <= RETRIES_PER_STAGE; attempt += 1) {
    const label = attempt === 0 ? phase : `${phase} 재시도`;
    let raw;
    try {
      raw = await runCli({ cli, model, prompt: currentPrompt, outputSchema });
    } catch (error) {
      error.phase = phase;
      if (error.rawOutput) records.push({ label, raw: error.rawOutput });
      error.rawOutput = labelledOutput(records);
      throw error;
    }

    records.push({ label, raw });
    const parsed = parseAndValidateJson(raw, outputSchema);
    if (parsed.ok) {
      return { ok: true, value: parsed.value, rawOutput: labelledOutput(records) };
    }

    if (attempt === RETRIES_PER_STAGE) {
      return {
        ok: false,
        value: null,
        error: parsed.error,
        errors: parsed.errors,
        rawOutput: labelledOutput(records),
      };
    }

    currentPrompt = repairPrompt(parsed.error, outputText(raw));
  }

  throw new Error('검증 단계가 예기치 않게 종료되었습니다');
}
