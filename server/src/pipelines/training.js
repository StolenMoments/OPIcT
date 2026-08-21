import { createHash } from 'node:crypto';
import { runValidatedStage, combineRawOutputs } from '../ai/validated.js';
import { trainingGradeSchema, trainingMaterialSchema } from '../ai/schemas.js';
import {
  buildTrainingGradePrompt,
  buildTrainingGradeRepairPrompt,
  buildTrainingMaterialPrompt,
  buildTrainingMaterialRepairPrompt,
} from '../ai/prompts.js';
import { reviewAfterOutcome, selectSessionItems, seoulDate } from '../training/policy.js';

function parseSources(rows) {
  return rows.flatMap((row) => {
    if (row.source_type === 'note') {
      if (typeof row.source_text !== 'string' || !row.source_text.trim()) return [];
      return [{
        source_type: 'note',
        source_id: row.id,
        source_text: row.source_text,
        created_at: row.created_at,
        result: { text_en: row.source_text, memo: row.memo ?? null },
      }];
    }
    try {
      const result = JSON.parse(row.result_json);
      if (!result || typeof result !== 'object') return [];
      if (row.source_type === 'attempt' && (!Array.isArray(result.correction_notes) || !Array.isArray(result.recommended_expressions))) return [];
      if (row.source_type === 'correction' && (typeof result.corrected !== 'string' || !Array.isArray(result.alternatives))) return [];
      return [{
        source_type: row.source_type,
        source_id: row.id,
        source_text: row.source_text,
        created_at: row.created_at,
        result,
      }];
    } catch {
      return [];
    }
  });
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sourceVersion(source) {
  return createHash('sha256').update(stableSerialize({
    source_type: source.source_type,
    source_id: source.source_id,
    source_text: source.source_text,
    result: source.result,
  })).digest('hex');
}

function snapshotVersion(snapshotJson) {
  try {
    const snapshot = JSON.parse(snapshotJson);
    if (!snapshot || typeof snapshot !== 'object' || !('result' in snapshot)) return null;
    return sourceVersion(snapshot);
  } catch {
    return null;
  }
}

function sourceHasMaterial(source, sentences) {
  const version = sourceVersion(source);
  return sentences.some((sentence) => (
    sentence.source_type === source.source_type
    && sentence.source_id === source.source_id
    && snapshotVersion(sentence.source_snapshot_json) === version
  ));
}

function fingerprint(reference) {
  const normalized = reference.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

export async function runTrainingSession(repos, sessionId, now = () => new Date()) {
  const session = repos.training.getSession(sessionId);
  const today = seoulDate(now());
  let sentences = repos.training.listSentences();
  let selected = selectSessionItems(sentences, today, 5);
  let rawOutput = session.raw_output;

  const finishReady = () => {
    repos.training.addSessionItems(sessionId, selected);
    repos.training.setSessionStatus(sessionId, {
      status: 'ready',
      error_code: null,
      error_message: null,
      raw_output: rawOutput,
    });
  };
  const finishEmpty = (errorCode, errorMessage) => {
    repos.training.setSessionStatus(sessionId, {
      status: 'empty',
      error_code: errorCode,
      error_message: errorMessage,
      raw_output: rawOutput,
    });
  };

  if (selected.length >= 5) {
    finishReady();
    return;
  }

  const sources = parseSources(repos.training.listSources());
  if (sources.length === 0) {
    if (selected.length > 0) {
      finishReady();
    } else {
      finishEmpty(
        sentences.length === 0 ? 'NO_SOURCE_RECORDS' : 'NO_DUE_SENTENCES',
        sentences.length === 0
          ? '완료된 평가 또는 자유 교정 기록이 없습니다.'
          : '오늘 복습할 문장이나 새 문장이 없습니다.',
      );
    }
    return;
  }

  const pendingSources = sources.filter((source) => !sourceHasMaterial(source, sentences));
  if (pendingSources.length === 0) {
    if (selected.length > 0) {
      finishReady();
    } else {
      finishEmpty('NO_DUE_SENTENCES', '오늘 복습할 문장이나 새 문장이 없습니다.');
    }
    return;
  }

  try {
    const generated = await runValidatedStage({
      cli: session.cli,
      model: session.model,
      prompt: buildTrainingMaterialPrompt(pendingSources),
      repairPrompt: (error, failedRaw) => buildTrainingMaterialRepairPrompt(pendingSources, error, failedRaw),
      outputSchema: trainingMaterialSchema,
      phase: '훈련 문장 생성',
    });
    rawOutput = combineRawOutputs(rawOutput, generated.rawOutput);
    if (!generated.ok) {
      repos.training.setSessionStatus(sessionId, {
        status: 'error',
        error_code: 'MATERIAL_INVALID',
        error_message: `훈련 문장 결과를 확인할 수 없습니다: ${generated.error}`,
        raw_output: rawOutput,
      });
      return;
    }

    const sourceMap = new Map(pendingSources.map((source) => [`${source.source_type}:${source.source_id}`, source]));
    for (const candidate of generated.value.items) {
      const source = sourceMap.get(`${candidate.source_type}:${candidate.source_id}`);
      if (!source) continue;
      repos.training.insertSentence({
        ...candidate,
        source_snapshot_json: JSON.stringify(source),
        fingerprint: fingerprint(candidate.reference_en),
      });
    }

    sentences = repos.training.listSentences();
    selected = selectSessionItems(sentences, today, 5);
    if (selected.length === 0) {
      finishEmpty('NO_DUE_SENTENCES', '오늘 복습할 문장이나 새 문장이 없습니다.');
      return;
    }
    finishReady();
  } catch (error) {
    repos.training.setSessionStatus(sessionId, {
      status: 'error',
      error_code: 'MATERIAL_FAILED',
      error_message: `훈련 문장 생성 실패: ${error.message}`,
      raw_output: combineRawOutputs(rawOutput, error.rawOutput),
    });
  }
}

export async function runTrainingAnswer(repos, answerId, now = () => new Date()) {
  const answer = repos.training.setAnswerRunning(answerId);
  const context = {
    intent_ko: answer.intent_ko,
    focus_ko: answer.focus_ko,
    reference_en: answer.reference_en,
    answer_text: answer.answer_text,
    attempt_no: answer.attempt_no,
  };
  let rawOutput = answer.raw_output;
  try {
    const graded = await runValidatedStage({
      cli: repos.training.getSession(answer.session_id).cli,
      model: repos.training.getSession(answer.session_id).model,
      prompt: buildTrainingGradePrompt(context),
      repairPrompt: (error, failedRaw) => buildTrainingGradeRepairPrompt(context, error, failedRaw),
      outputSchema: trainingGradeSchema,
      phase: `답안 ${answer.attempt_no}차 채점`,
    });
    rawOutput = combineRawOutputs(rawOutput, graded.rawOutput);
    if (!graded.ok) {
      repos.training.markAnswerError(answerId, `답안 결과를 확인할 수 없습니다: ${graded.error}`, rawOutput);
      return;
    }
    if (answer.attempt_no === 1 && !graded.value.passes) {
      repos.training.markFirstFailure(answerId, JSON.stringify(graded.value), rawOutput);
      return;
    }
    const outcome = answer.attempt_no === 1
      ? 'first_try_pass'
      : graded.value.passes ? 'hint_pass' : 'review';
    const sentence = repos.training.getSentence(answer.sentence_id);
    const review = reviewAfterOutcome(sentence, outcome, seoulDate(now()));
    repos.training.completeAnswer(answerId, JSON.stringify(graded.value), rawOutput, outcome, review);
  } catch (error) {
    repos.training.markAnswerError(
      answerId,
      `답안 채점 실패: ${error.message}`,
      combineRawOutputs(rawOutput, error.rawOutput),
    );
  }
}
