import ErrorBanner from './ui/ErrorBanner';
import StatusPill from './ui/StatusPill';
import type { Attempt, EvalResult } from '../types';
import './AttemptResult.css';

const PIPELINE = [
  { key: 'uploaded', label: '업로드' },
  { key: 'transcribing', label: '전사' },
  { key: 'evaluating', label: '평가' },
] as const;

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
      !Array.isArray(parsed.recommended_expressions)
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
function pillStatusFor(rowStatus: string, stageKey: string): 'pending' | 'running' | 'done' {
  const stageIdx = PIPELINE.findIndex((p) => p.key === stageKey);
  const rowIdx = PIPELINE.findIndex((p) => p.key === rowStatus);
  if (rowStatus === 'done' || rowIdx > stageIdx) return 'done';
  if (rowIdx === stageIdx) return 'running';
  return 'pending';
}

export default function AttemptResult({ row }: { row: Attempt }) {
  if (row.status === 'error') {
    return (
      <div className="section" aria-live="polite">
        <ErrorBanner message={row.error_message ?? '평가 중 오류가 발생했습니다.'} />
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
    return (
      <div className="attempt-pipeline" aria-live="polite">
        {PIPELINE.map((stage) => (
          <span key={stage.key} className="attempt-pipeline__stage">
            <span className="attempt-pipeline__stage-label">{stage.label}</span>
            <StatusPill status={pillStatusFor(row.status, stage.key)} />
          </span>
        ))}
        <span className="attempt-pipeline__label">{STATUS_KO[row.status] ?? row.status}…</span>
      </div>
    );
  }

  const result = safeParseResult(row.result_json);
  if (!result) {
    return (
      <div className="section" aria-live="polite">
        <ErrorBanner message="결과를 표시할 수 없습니다." />
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
    <div className="section" aria-live="polite">
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
