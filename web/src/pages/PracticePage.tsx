import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import CategoryPicker from "../components/CategoryPicker";
import CliPicker from "../components/CliPicker";
import AttemptResult from "../components/AttemptResult";
import { Button } from "@/components/ui/button";
import ErrorAlert from "@/components/ui/ErrorAlert";
import ActionEmpty from "@/components/ui/ActionEmpty";
import ListSkeleton from "@/components/ui/ListSkeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRecorder } from "../hooks/useRecorder";
import { usePolling } from "../hooks/usePolling";
import type { Attempt, Question } from "../types";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function PracticePage({ visible = true }: { visible?: boolean }) {
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
  const [cli, setCli] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<"record" | "text">("record");
  const [scriptText, setScriptText] = useState("");
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [active, setActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    recording,
    start,
    stop,
    elapsedSec,
    error: recorderError,
  } = useRecorder();

  // `handleFinish`'s async closure captures `q` at click time, which React
  // does not update once the async body resumes after an await. This ref
  // mirrors the live `q` on every render so the post-upload check below
  // reads the question actually selected *now*, not the one selected when
  // the upload started.
  const qRef = useRef<Question | null>(q);
  qRef.current = q;

  // selectQuestion resets `mode` to the user's saved default on every question
  // change; a ref (not state) is used because the async /settings fetch below
  // may resolve after the user has already picked a question.
  const defaultModeRef = useRef<"record" | "text">("record");

  // The practice, correct, notes, history and settings tabs all stay mounted
  // at once (App.tsx toggles `hidden`, it doesn't unmount), so a mount-only
  // effect would only ever see the settings that existed on first load.
  // Re-running this whenever the tab becomes visible again picks up changes
  // saved from the settings tab without requiring a full page refresh. Only
  // the picker screen's cli/mode selectors are overwritten (`!qRef.current`)
  // so returning to an in-progress recording or typed answer doesn't get its
  // selection reset out from under the user.
  useEffect(() => {
    if (!visible) return;
    api<Record<string, string>>("/settings").then((s) => {
      if (s.default_input_mode === "text" || s.default_input_mode === "record") {
        defaultModeRef.current = s.default_input_mode;
      }
      if (qRef.current) return;
      if (s.default_cli) {
        setCli(s.default_cli);
        setModel(s[`default_model_${s.default_cli}`] ?? "");
      }
      if (s.default_input_mode === "text" || s.default_input_mode === "record") {
        setMode(s.default_input_mode);
      }
    });
  }, [visible]);

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

  const rawRow = usePolling<Attempt>(
    () => api<Attempt>(`/attempts/${attemptId}`),
    active,
  );
  // rawRow can still hold the previous attempt's data for one render after a
  // new attempt starts, so gate it on the current attemptId before treating
  // it as "the" row — mirrors CorrectPage's corrected polling pattern.
  const row = rawRow?.id === attemptId ? rawRow : null;

  useEffect(() => {
    if (row && (row.status === "done" || row.status === "error")) {
      setActive(false);
    }
  }, [row]);

  const settled = row?.status === "done" || row?.status === "error";
  const busy = submitting || (attemptId != null && !settled);

  const selectQuestion = (question: Question) => {
    setQ(question);
    setAttemptId(null);
    setActive(false);
    setErr(null);
    setMode(defaultModeRef.current);
    setScriptText("");
  };

  const handleStart = async () => {
    try {
      await start();
      setErr(null);
    } catch {
      // useRecorder owns microphone and permission errors so the page renders
      // one recovery message instead of duplicating the same failed signal.
    }
  };

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
        form.append("audio", blob, "answer.webm");
        form.append("question_id", String(questionId));
        if (cli) {
          form.append("cli", cli);
          form.append("model", model);
        }
        const { id } = await api<{ id: number }>("/attempts", {
          method: "POST",
          body: form,
        });
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

  const handleSubmitText = () => {
    // handleFinish 위 주석과 같은 이유로 지금 값을 캡처한다 — 전송 중 다른
    // 문항으로 이동해도 이 클로저의 questionId는 스크립트를 쓸 때의 문항에 고정된다.
    const questionId = q!.id;
    const text = scriptText.trim();
    setSubmitting(true);
    return guard(async () => {
      try {
        const { id } = await api<{ id: number }>("/attempts", {
          method: "POST",
          body: JSON.stringify({
            question_id: questionId,
            script_text: text,
            ...(cli ? { cli, model } : {}),
          }),
        });
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
        <div className="page-heading">
          <h2>연습</h2>
          <p>질문을 고르고 오늘의 답변 신호를 준비하세요.</p>
        </div>
        {err && <ErrorAlert message={err} onDismiss={() => setErr(null)} />}

        <div className="section">
          <CategoryPicker value={catId} onChange={setCatId} />

          {catId == null && (
            <ActionEmpty message="카테고리를 선택하면 문항이 표시됩니다." />
          )}
          {catId != null && questions === null && <ListSkeleton rows={3} />}
          {catId != null && questions !== null && questions.length === 0 && (
            <ActionEmpty message="이 카테고리에 문항이 없습니다. 설정 메뉴에서 문항을 추가해 보세요." />
          )}
          {catId != null && questions !== null && questions.length > 0 && (
            <ul className="row-list">
              {questions.map((it) => (
                <li key={it.id} className="row-list__item">
                  <button
                    type="button"
                    className="practice-question-pick"
                    onClick={() => selectQuestion(it)}
                  >
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setQ(null)}
        disabled={recording || submitting}
      >
        문항 목록으로
      </Button>

      {err && <ErrorAlert message={err} onDismiss={() => setErr(null)} />}
      {recorderError && <ErrorAlert message={recorderError} />}

      <div className="practice-layout">
        <section className="section" aria-labelledby="practice-question-title">
          <span className="console-label">현재 질문</span>
          <h2 id="practice-question-title" className="practice-question">
            {q.text}
          </h2>
          {q.note && <p className="practice-question__hint">힌트: {q.note}</p>}
        </section>

        <div className="practice-signal-rail">
          <section className="section" aria-label="평가 신호 설정">
            <span className="console-label">평가 채널</span>
            <CliPicker
              cli={cli}
              model={model}
              onChange={(c, m) => {
                setCli(c);
                setModel(m);
              }}
            />
          </section>

          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "record" | "text")}
          >
            <TabsList variant="line" aria-label="답변 제출 방식">
              <TabsTrigger value="record" disabled={busy || recording}>
                녹음
              </TabsTrigger>
              <TabsTrigger value="text" disabled={busy || recording}>
                텍스트로 입력
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "record" ? (
            <div className="practice-record">
              {!recording ? (
                <Button
                  className="practice-record__btn"
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
                  <span className="practice-record__elapsed" role="timer">
                    녹음 중 {formatElapsed(elapsedSec)}
                  </span>
                  {submitting && (
                    <span
                      className="practice-transmitting"
                      role="status"
                      aria-label="답변 신호 전송 중"
                    >
                      <Spinner aria-hidden="true" />
                      답변 신호 전송 중
                    </span>
                  )}
                  <Button
                    className="practice-record__btn"
                    onClick={handleFinish}
                    disabled={submitting}
                    aria-busy={submitting}
                  >
                    {submitting && <Spinner aria-label="답변 업로드 중" />}
                    녹음 종료·제출
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="practice-record">
              <Field>
                <FieldLabel htmlFor="practice-script">답변 스크립트</FieldLabel>
                <Textarea
                  id="practice-script"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  rows={5}
                  placeholder="답변으로 말하고 싶은 내용을 영어로 입력하세요."
                  disabled={busy}
                />
              </Field>
              {submitting && (
                <span
                  className="practice-transmitting"
                  role="status"
                  aria-label="답변 신호 전송 중"
                >
                  <Spinner aria-hidden="true" />
                  답변 신호 전송 중
                </span>
              )}
              <Button
                className="practice-record__btn"
                onClick={handleSubmitText}
                disabled={submitting || !scriptText.trim()}
                aria-busy={submitting}
              >
                {submitting && <Spinner aria-label="스크립트 전송 중" />}
                스크립트 제출
              </Button>
            </div>
          )}
        </div>
      </div>

      {row && (
        <div className="section">
          <AttemptResult row={row} />
        </div>
      )}
      {!row && attemptId != null && <ListSkeleton rows={2} />}
      {!row && attemptId == null && !recording && !submitting && (
        <ActionEmpty message="녹음 시작을 눌러 첫 답변 신호를 보내 보세요." />
      )}
    </div>
  );
}
