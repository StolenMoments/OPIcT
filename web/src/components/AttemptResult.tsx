import ErrorAlert from './ui/ErrorAlert';
import StatusBadge from './ui/StatusBadge';
import { diffWords } from '../lib/diff';
import type { Attempt, EvalResult } from '../types';

const PIPELINE_AUDIO = [
  { key: 'uploaded', label: '업로드' },
  { key: 'transcribing', label: '전사' },
  { key: 'evaluating', label: '평가' },
] as const;

// 텍스트로 입력한 시도는 업로드·전사 단계 없이 바로 평가로 시작하므로 그 두 단계를 생략한다.
const PIPELINE_TEXT = [{ key: 'evaluating', label: '평가' }] as const;

type PipelineStage = { key: string; label: string };

const STATUS_KO: Record<string, string> = {
  uploaded: '대기 중',
  transcribing: '전사 중',
  evaluating: '평가 중',
};

function safeParseResult(json: string | null): EvalResult | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<EvalResult>;
    if (
      typeof parsed.summary_ko !== 'string' ||
      !Array.isArray(parsed.strengths_ko) ||
      !Array.isArray(parsed.improvements_ko) ||
      !Array.isArray(parsed.recommended_expressions) ||
      (parsed.corrected_answer !== undefined && typeof parsed.corrected_answer !== 'string')
    ) {
      return null;
    }
    return parsed as EvalResult;
  } catch {
    return null;
  }
}

// Pipeline stages before the attempt's current status are "done"; the
// current status (when it's still in progress) is "running"; later stages
// are "pending". This turns the status field into a readable sequence
// instead of a single generic spinner.
function pillStatusFor(rowStatus: string, stageKey: string, pipeline: readonly PipelineStage[]): 'pending' | 'running' | 'done' {
  const stageIdx = pipeline.findIndex((p) => p.key === stageKey);
  const rowIdx = pipeline.findIndex((p) => p.key === rowStatus);
  if (rowStatus === 'done' || rowIdx > stageIdx) return 'done';
  if (rowIdx === stageIdx) return 'running';
  return 'pending';
}

export default function AttemptResult({ row }: { row: Attempt }) {
  if (row.status === 'error') {
    return (
      <div className="attempt-result" aria-live="polite">
        <ErrorAlert message={row.error_message ?? '평가 중 오류가 발생했습니다.'} />
        {row.raw_output && (
          <details className="raw-output">
            <summary>원문 보기</summary>
            <pre>{row.raw_output}</pre>
          </details>
        )}
      </div>
    );
  }

  if (row.status !== 'done') {
    const pipeline = row.input_mode === 'text' ? PIPELINE_TEXT : PIPELINE_AUDIO;
    return (
      <div className="attempt-pipeline" aria-live="polite">
        {pipeline.map((stage) => (
          <span key={stage.key} className="attempt-pipeline__stage">
            <span className="attempt-pipeline__stage-label">{stage.label}</span>
            <StatusBadge status={pillStatusFor(row.status, stage.key, pipeline)} />
          </span>
        ))}
        <span className="attempt-pipeline__label">{STATUS_KO[row.status] ?? row.status}…</span>
      </div>
    );
  }

  const result = safeParseResult(row.result_json);
  if (!result) {
    return (
      <div className="attempt-result" aria-live="polite">
        <ErrorAlert message="결과를 표시할 수 없습니다." />
        {row.raw_output && (
          <details className="raw-output">
            <summary>원문 보기</summary>
            <pre>{row.raw_output}</pre>
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="attempt-result" aria-live="polite">
      {row.transcript && (
        <div>
          <h3>내 답변 (전사)</h3>
          <p>{row.transcript}</p>
        </div>
      )}
      <div>
        <h3>총평</h3>
        <p>{result.summary_ko}</p>
      </div>
      {row.transcript && result.corrected_answer && (
        <div>
          <h3>전체 교정본</h3>
          <p className="row-list__meta">취소선은 삭제된 표현, 강조색은 수정·추가된 표현입니다.</p>
          <p className="diff-text">
            {diffWords(row.transcript, result.corrected_answer).map((token, i) => {
              if (token.type === 'delete') {
                return (
                  <del key={i} className="diff-text__delete">
                    {token.text}
                  </del>
                );
              }
              if (token.type === 'insert') {
                return (
                  <ins key={i} className="diff-text__insert">
                    {token.text}
                  </ins>
                );
              }
              return <span key={i}>{token.text}</span>;
            })}
          </p>
        </div>
      )}
      <div>
        <h3>잘한 점</h3>
        <ul className="row-list">
          {result.strengths_ko.map((s, i) => (
            <li key={i} className="row-list__item">
              <span className="row-list__text">{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>개선점</h3>
        <ul className="row-list">
          {result.improvements_ko.map((s, i) => (
            <li key={i} className="row-list__item">
              <span className="row-list__text">{s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>추천 표현</h3>
        <ul className="row-list">
          {result.recommended_expressions.map((e, i) => (
            <li key={i} className="row-list__item">
              <div className="row-list__main">
                <span className="row-list__text">{e.text}</span>
                <span className="row-list__meta">{e.note_ko}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
