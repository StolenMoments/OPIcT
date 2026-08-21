import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Lightbulb,
  RotateCcw,
  X,
} from 'lucide-react';
import { api, ApiError } from '../api';
import { usePolling } from '../hooks/usePolling';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import ErrorAlert from '@/components/ui/ErrorAlert';
import ActionEmpty from '@/components/ui/ActionEmpty';
import type {
  TrainingAnswer,
  TrainingItem,
  TrainingSession,
  TrainingVerdict,
} from '../types';

type StartRecovery = 'settings' | 'generic' | null;

const SOURCE_LABELS: Record<TrainingItem['source_type'], string> = {
  attempt: '평가 기록',
  correction: '자유 교정 기록',
  note: '저장한 노트',
};

const AREA_LABELS: Array<[keyof TrainingVerdict['areas'], string]> = [
  ['meaning', '의미'],
  ['grammar', '문법'],
  ['naturalness', '자연스러움'],
  ['focus', '학습 초점'],
];

function FeedbackPanel({ item, answer }: { item: TrainingItem; answer: TrainingAnswer | null }) {
  const verdict = answer?.status === 'done' ? answer.verdict : undefined;
  const reference = item.reference_en ?? answer?.reference_en;

  return (
    <section className="section training-feedback" aria-live="polite">
      <div className="training-panel-heading">
        <h3>피드백과 비교</h3>
        {answer?.status === 'done' && verdict && (
          <span className={`training-verdict training-verdict--${verdict.passes ? 'pass' : 'retry'}`}>
            {verdict.passes ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            {verdict.passes ? '통과' : '다시 써 보기'}
          </span>
        )}
      </div>

      {!answer && (
        <ActionEmpty message="영어 문장을 제출하면 영역별 신호와 다음 단계가 여기에 표시됩니다." />
      )}

      {answer?.status === 'error' && (
        <ErrorAlert message={answer.error_message ?? '답안을 채점하지 못했습니다.'} />
      )}

      {verdict && (
        <div className="training-feedback__body">
          <ul className="training-area-list" aria-label="영역별 판정">
            {AREA_LABELS.map(([key, label]) => {
              const area = verdict.areas[key];
              return (
                <li key={key} className="training-area-list__item">
                  <span className={`training-area-list__signal training-area-list__signal--${area.passes ? 'pass' : 'retry'}`}>
                    {area.passes ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                    {label} {area.passes ? '충족' : '보완'}
                  </span>
                  <span>{area.feedback_ko}</span>
                </li>
              );
            })}
          </ul>

          {verdict.hint_ko && (
            <div className="training-hint">
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>한국어 힌트</strong>
                <p className="whitespace-pre-line">{verdict.hint_ko}</p>
              </div>
            </div>
          )}

          {reference && (
            <div className="training-comparison">
              <h3>예문 비교</h3>
              {item.answers.map((savedAnswer) => (
                <div key={savedAnswer.id} className="training-comparison__row">
                  <span>{savedAnswer.attempt_no === 1 ? '첫 답안' : '재작성'}</span>
                  <p>{savedAnswer.answer_text}</p>
                </div>
              ))}
              {item.answers.length === 0 && answer && (
                <div className="training-comparison__row">
                  <span>{answer.attempt_no === 1 ? '첫 답안' : '재작성'}</span>
                  <p>{answer.answer_text}</p>
                </div>
              )}
              <div className="training-comparison__row training-comparison__row--reference">
                <span>기준 예문</span>
                <p>{reference}</p>
              </div>
              <p className="training-comparison__note">기준 예문과 달라도 의도와 학습 초점을 충족하면 통과합니다.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Completion({ session, onMore }: { session: TrainingSession; onMore: () => void }) {
  const summary = session.summary ?? { first_try_pass: 0, hint_pass: 0, review: 0 };
  return (
    <section className="section training-complete" aria-live="polite">
      <div className="training-complete__mark"><Check aria-hidden="true" /></div>
      <div>
        <h3>오늘의 문장 완료</h3>
        <p>이번 세션의 문장 신호를 모두 확인했습니다.</p>
      </div>
      <dl className="training-summary">
        <div><dt>첫 시도 통과</dt><dd>{summary.first_try_pass}</dd></div>
        <div><dt>힌트 후 통과</dt><dd>{summary.hint_pass}</dd></div>
        <div><dt>다시 볼 문장</dt><dd>{summary.review}</dd></div>
      </dl>
      <Button onClick={onMore}>5문장 더</Button>
    </section>
  );
}

export default function TrainingPage({
  onOpenCorrection,
  onOpenSettings,
  visible = true,
}: {
  onOpenCorrection: () => void;
  onOpenSettings: () => void;
  visible?: boolean;
}) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [pollSession, setPollSession] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startRecovery, setStartRecovery] = useState<StartRecovery>(null);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [activeAnswerId, setActiveAnswerId] = useState<number | null>(null);
  const [pollAnswer, setPollAnswer] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<TrainingAnswer | null>(null);
  const initializedSession = useRef<number | null>(null);
  const wasVisible = useRef(visible);

  useEffect(() => {
    if (visible && !wasVisible.current && startRecovery === 'settings') {
      setStartError(null);
      setStartRecovery(null);
    }
    wasVisible.current = visible;
  }, [startRecovery, visible]);

  const refreshSession = useCallback(async (id: number) => {
    const value = await api<TrainingSession>(`/training/sessions/${id}`);
    setSession(value);
    if (initializedSession.current !== value.id) {
      const firstIncomplete = value.items.findIndex((item) => item.status !== 'completed');
      setDisplayIndex(firstIncomplete >= 0 ? firstIncomplete : Math.max(value.items.length - 1, 0));
      setShowSummary(value.status === 'completed');
      initializedSession.current = value.id;
    }
    return value;
  }, []);

  const sessionPoll = usePolling<TrainingSession>(
    () => api<TrainingSession>(`/training/sessions/${sessionId}`),
    sessionId != null && pollSession,
    1200,
    String(sessionId),
  );

  useEffect(() => {
    if (!sessionPoll) return;
    setSession(sessionPoll);
    if (initializedSession.current !== sessionPoll.id) {
      const firstIncomplete = sessionPoll.items.findIndex((item) => item.status !== 'completed');
      setDisplayIndex(firstIncomplete >= 0 ? firstIncomplete : Math.max(sessionPoll.items.length - 1, 0));
      setShowSummary(sessionPoll.status === 'completed');
      initializedSession.current = sessionPoll.id;
    }
    if (sessionPoll.status !== 'building') setPollSession(false);
  }, [sessionPoll]);

  const answerPoll = usePolling<TrainingAnswer>(
    () => api<TrainingAnswer>(`/training/answers/${activeAnswerId}`),
    activeAnswerId != null && pollAnswer,
    1200,
    String(activeAnswerId),
  );

  useEffect(() => {
    if (!answerPoll || (answerPoll.status !== 'done' && answerPoll.status !== 'error')) return;
    setLastAnswer(answerPoll);
    setPollAnswer(false);
    if (sessionId != null) {
      void refreshSession(sessionId)
        .then(() => setActiveAnswerId(null))
        .catch(() => setPollSession(true));
    }
  }, [answerPoll, refreshSession, sessionId]);

  const reset = () => {
    setSessionId(null);
    setSession(null);
    setPollSession(false);
    setStartError(null);
    setStartRecovery(null);
    setDisplayIndex(0);
    setShowSummary(false);
    setDrafts({});
    setActiveAnswerId(null);
    setPollAnswer(false);
    setLastAnswer(null);
    initializedSession.current = null;
  };

  const start = async () => {
    setStarting(true);
    setStartError(null);
    setStartRecovery(null);
    try {
      const created = await api<{ id: number }>('/training/sessions', { method: 'POST' });
      setSessionId(created.id);
      setPollSession(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ACTIVE_TRAINING_SESSION' && typeof error.details.session_id === 'number') {
        setSessionId(error.details.session_id);
        setPollSession(true);
      } else {
        setStartError(error instanceof Error ? error.message : String(error));
        setStartRecovery(error instanceof ApiError && error.code === 'TRAINING_SETTINGS_REQUIRED' ? 'settings' : 'generic');
      }
    } finally {
      setStarting(false);
    }
  };

  const currentItem = session?.items[displayIndex] ?? null;
  const itemAnswers = currentItem?.answers ?? [];
  const currentAnswer = lastAnswer?.session_item_id === currentItem?.id
    ? lastAnswer
    : itemAnswers[itemAnswers.length - 1] ?? null;
  const itemGrading = currentItem?.status === 'grading_first' || currentItem?.status === 'grading_revision';
  const answerNotSynced = activeAnswerId != null
    && lastAnswer?.id === activeAnswerId
    && lastAnswer.session_item_id === currentItem?.id
    && !itemAnswers.some((answer) => answer.id === activeAnswerId);
  const answerBusy = (pollAnswer && activeAnswerId != null) || itemGrading || answerNotSynced;
  const draft = currentItem ? drafts[currentItem.id] ?? '' : '';

  const submit = async () => {
    if (!currentItem || !draft.trim()) return;
    setLastAnswer(null);
    try {
      const created = await api<{ id: number }>(`/training/items/${currentItem.id}/answers`, {
        method: 'POST',
        body: JSON.stringify({ answer_text: draft }),
      });
      setActiveAnswerId(created.id);
      setPollAnswer(true);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
      setStartRecovery('generic');
    }
  };

  const retry = async () => {
    if (!currentAnswer) return;
    try {
      const retried = await api<{ id: number }>(`/training/answers/${currentAnswer.id}/retry`, { method: 'POST' });
      setStartError(null);
      setActiveAnswerId(retried.id);
      setPollAnswer(true);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
      setStartRecovery('generic');
    }
  };

  if (!sessionId && !session) {
    return (
      <section className="section training-start">
        {startError && <ErrorAlert message={startError} onDismiss={() => setStartError(null)} />}
        <ActionEmpty
          message="평가와 자유 교정 기록에서 오늘 복습할 문장을 최대 5개 준비합니다."
          action={
            startRecovery === 'settings' ? (
              <Button onClick={onOpenSettings}>설정 열기</Button>
            ) : (
              <Button onClick={start} disabled={starting} aria-busy={starting}>
                {starting && <Spinner aria-label="오늘의 문장 준비 중" />}
                오늘의 문장 시작
              </Button>
            )
          }
        />
      </section>
    );
  }

  if (!session || session.status === 'building') {
    return (
      <section className="section training-loading" aria-live="polite">
        <Spinner aria-label="오늘의 문장 생성 중" />
        <div><h3>오늘의 문장을 준비하고 있어요</h3><p>완료된 기록에서 복습할 표현을 고르는 중입니다.</p></div>
      </section>
    );
  }

  if (session.status === 'empty') {
    const noRecords = session.error_code === 'NO_SOURCE_RECORDS';
    return (
      <section className="section">
        <ActionEmpty
          message={noRecords
            ? '완료된 평가·교정 기록이 없어요. 연습 또는 자유 교정을 먼저 완료해 주세요.'
            : '오늘 복습할 문장이 아직 없습니다. 다음 복습일에 다시 확인해 주세요.'}
          action={noRecords ? <Button variant="outline" onClick={onOpenCorrection}>자유 교정 열기</Button> : undefined}
        />
      </section>
    );
  }

  if (session.status === 'error') {
    return (
      <section className="section training-start">
        <ErrorAlert message={session.error_message ?? '오늘의 문장을 만들지 못했습니다.'} />
        <Button onClick={() => { reset(); void start(); }}>다시 만들기</Button>
      </section>
    );
  }

  if (showSummary && session.status === 'completed') {
    return <Completion session={session} onMore={() => { reset(); void start(); }} />;
  }

  if (!currentItem) return null;
  const completed = currentItem.status === 'completed';
  const failed = currentAnswer?.status === 'error';
  const revision = currentItem.status === 'awaiting_revision' || currentItem.status === 'grading_revision' || currentItem.status === 'revision_error';

  return (
    <div className="training-flow">
      <div className="training-progress" aria-live="polite">
        <span>문장 {displayIndex + 1} / {session.items.length}</span>
        <progress aria-label="문장 훈련 진행률" value={displayIndex + (completed ? 1 : 0)} max={session.items.length} />
      </div>

      <div className="training-layout">
        <section className="section training-prompt">
          <div className="training-prompt__meta">
            <span>{SOURCE_LABELS[currentItem.source_type]}</span>
            <span>{currentItem.mastery_status === 'mastered' ? '익힘 복습' : '학습 중'}</span>
            {currentItem.is_variation && <span className="training-badge training-badge--variation">패턴 변형</span>}
          </div>
          <div className="training-intent">
            <span>한국어 의도</span>
            <p>{currentItem.intent_ko}</p>
          </div>
          <div className="training-focus">
            <span>학습 초점</span>
            <p>{currentItem.focus_ko}</p>
          </div>

          <Field>
            <FieldLabel htmlFor={`training-answer-${currentItem.id}`}>영어 문장</FieldLabel>
            <Textarea
              id={`training-answer-${currentItem.id}`}
              rows={4}
              value={draft}
              disabled={completed || answerBusy}
              placeholder="한국어 의도를 자연스러운 영어 한 문장으로 써 보세요."
              onChange={(event) => setDrafts((values) => ({ ...values, [currentItem.id]: event.target.value }))}
            />
          </Field>

          {failed ? (
            <Button onClick={() => void retry()} disabled={answerBusy}>
              {answerBusy && <Spinner aria-label="답안 다시 채점 중" />}
              답안 다시 채점
            </Button>
          ) : completed ? (
            <Button onClick={() => {
              setLastAnswer(null);
              if (displayIndex < session.items.length - 1) setDisplayIndex(displayIndex + 1);
              else setShowSummary(true);
            }}>
              {displayIndex < session.items.length - 1 ? '다음 문장' : '훈련 결과 보기'}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={!draft.trim() || answerBusy} aria-busy={answerBusy}>
              {answerBusy && <Spinner aria-label="답안 채점 중" />}
              {revision ? '재작성 확인' : '첫 답안 확인'}
            </Button>
          )}

          {startError && (
            <div className="training-inline-error" role="alert">
              <CircleAlert aria-hidden="true" /> {startError}
            </div>
          )}
        </section>

        <FeedbackPanel item={currentItem} answer={currentAnswer} />
      </div>
    </div>
  );
}
