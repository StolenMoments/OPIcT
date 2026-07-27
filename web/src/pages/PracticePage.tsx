import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import CategoryPicker from '../components/CategoryPicker';
import CliPicker from '../components/CliPicker';
import AttemptResult from '../components/AttemptResult';
import Button from '../components/ui/Button';
import ErrorBanner from '../components/ui/ErrorBanner';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import { useRecorder } from '../hooks/useRecorder';
import { usePolling } from '../hooks/usePolling';
import type { Attempt, Question } from '../types';
import './PracticePage.css';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function PracticePage() {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const [catId, setCatId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [cli, setCli] = useState('');
  const [model, setModel] = useState('');
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { recording, start, stop, elapsedSec, error: recorderError } = useRecorder();

  // `handleFinish`'s async closure captures `q` at click time, which React
  // does not update once the async body resumes after an await. This ref
  // mirrors the live `q` on every render so the post-upload check below
  // reads the question actually selected *now*, not the one selected when
  // the upload started.
  const qRef = useRef<Question | null>(q);
  qRef.current = q;

  useEffect(() => {
    api<Record<string, string>>('/settings').then((s) => {
      if (s.default_cli) {
        setCli(s.default_cli);
        setModel(s[`default_model_${s.default_cli}`] ?? '');
      }
    });
  }, []);

  const loadQs = useCallback(() => {
    if (!catId) {
      setQuestions(null);
      return;
    }
    setQuestions(null);
    api<Question[]>(`/questions?category_id=${catId}`)
      .then((qs) => {
        setQuestions(qs);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [catId]);
  useEffect(() => {
    setQ(null);
    loadQs();
  }, [loadQs]);

  const rawRow = usePolling<Attempt>(() => api<Attempt>(`/attempts/${attemptId}`), active);
  // rawRow can still hold the previous attempt's data for one render after a
  // new attempt starts, so gate it on the current attemptId before treating
  // it as "the" row — mirrors CorrectPage's corrected polling pattern.
  const row = rawRow?.id === attemptId ? rawRow : null;

  useEffect(() => {
    if (row && (row.status === 'done' || row.status === 'error')) {
      setActive(false);
    }
  }, [row]);

  const settled = row?.status === 'done' || row?.status === 'error';
  const busy = submitting || (attemptId != null && !settled);

  const selectQuestion = (question: Question) => {
    setQ(question);
    setAttemptId(null);
    setActive(false);
    setErr(null);
  };

  const handleStart = () => guard(() => start());

  const handleFinish = () => {
    // Captured now, not read from state after the await: if the user
    // navigates to a different question while the upload is still in
    // flight, this closure's questionId stays pinned to the question that
    // was actually recorded, so a late-arriving response can't attach its
    // attemptId to whatever question happens to be selected by then.
    const questionId = q!.id;
    setSubmitting(true);
    return guard(async () => {
      try {
        const blob = await stop();
        const form = new FormData();
        form.append('audio', blob, 'answer.webm');
        form.append('question_id', String(questionId));
        if (cli) {
          form.append('cli', cli);
          form.append('model', model);
        }
        const { id } = await api<{ id: number }>('/attempts', { method: 'POST', body: form });
        // The user may have picked a different question while this was in
        // flight (the back button and other controls are disabled while
        // `submitting` is true, but this ref read is the authoritative
        // check — it can't go stale the way a captured `q` would).
        if (qRef.current?.id === questionId) {
          setAttemptId(id);
          setActive(true);
        }
      } finally {
        setSubmitting(false);
      }
    });
  };

  if (!q) {
    return (
      <div className="page">
        <h2>연습</h2>
        {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}

        <div className="section">
          <CategoryPicker value={catId} onChange={setCatId} />

          {catId == null && <EmptyState message="카테고리를 선택하면 문항이 표시됩니다." />}
          {catId != null && questions === null && <Skeleton rows={3} />}
          {catId != null && questions !== null && questions.length === 0 && (
            <EmptyState message="이 카테고리에 문항이 없습니다. 설정 탭에서 문항을 추가해 보세요." />
          )}
          {catId != null && questions !== null && questions.length > 0 && (
            <ul className="row-list">
              {questions.map((it) => (
                <li key={it.id} className="row-list__item">
                  <button type="button" className="practice-question-pick" onClick={() => selectQuestion(it)}>
                    <span className="row-list__text">{it.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <Button variant="ghost" size="sm" onClick={() => setQ(null)} disabled={recording || submitting}>
        ← 문항 목록
      </Button>

      {err && <ErrorBanner message={err} onDismiss={() => setErr(null)} />}
      {recorderError && <ErrorBanner message={recorderError} />}

      <div className="section">
        <p className="practice-question">{q.text}</p>
        {q.note && <p className="practice-question__hint">힌트: {q.note}</p>}
      </div>

      <div className="section">
        <div className="section__row">
          <CliPicker cli={cli} model={model} onChange={(c, m) => { setCli(c); setModel(m); }} />
        </div>

        <div className="practice-record">
          {!recording ? (
            <Button
              className="practice-record__btn"
              variant="primary"
              onClick={handleStart}
              disabled={busy}
            >
              녹음 시작
            </Button>
          ) : (
            <>
              <span className="practice-record__live" aria-hidden="true">
                <span className="practice-record__tally" />
              </span>
              <span className="practice-record__elapsed" role="status" aria-live="polite">
                녹음 중 {formatElapsed(elapsedSec)}
              </span>
              <Button
                className="practice-record__btn"
                variant="primary"
                onClick={handleFinish}
                disabled={submitting}
                loading={submitting}
              >
                녹음 종료·제출
              </Button>
            </>
          )}
        </div>
      </div>

      {row && (
        <div className="section">
          <AttemptResult row={row} />
        </div>
      )}
      {!row && (attemptId != null || submitting) && <Skeleton rows={2} />}
      {!row && attemptId == null && !recording && !submitting && (
        <EmptyState message="아직 녹음한 답변이 없습니다. 녹음 시작을 눌러 답변해 보세요." />
      )}
    </div>
  );
}
