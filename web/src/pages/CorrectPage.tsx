import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import CliPicker from "../components/CliPicker";
import CategoryPicker from "../components/CategoryPicker";
import { usePolling } from "../hooks/usePolling";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import StatusBadge from "@/components/ui/StatusBadge";
import ErrorAlert from "@/components/ui/ErrorAlert";
import ActionEmpty from "@/components/ui/ActionEmpty";
import ListSkeleton from "@/components/ui/ListSkeleton";
import type { Correction, CorrectionResult } from "../types";

function safeParseResult(json: string | null): CorrectionResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as CorrectionResult;
  } catch {
    return null;
  }
}

function SaveToNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [catId, setCatId] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    try {
      await api("/sentences", {
        method: "POST",
        body: JSON.stringify({
          category_id: catId,
          text_en: text,
          source: "correction",
        }),
      });
      setSaved(true);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (saved) {
    return (
      <span className="save-to-note__done" role="status" aria-live="polite">
        저장됨 ✓
      </span>
    );
  }
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        노트에 저장
      </Button>
    );
  }
  return (
    <span className="save-to-note">
      <CategoryPicker value={catId} onChange={setCatId} />
      <Button size="sm" disabled={!catId} onClick={save}>
        저장
      </Button>
      {err && (
        <p className="field__error" role="alert">
          {err}
        </p>
      )}
    </span>
  );
}

export default function CorrectPage({ visible = true }: { visible?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const [input, setInput] = useState("");
  const [cli, setCli] = useState("");
  const [model, setModel] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  // Mirrors the live `jobId` so the settings-refresh effect below can check
  // it from inside an async callback without depending on `jobId` and
  // re-running (and re-fetching) every time a correction is submitted.
  const jobIdRef = useRef<number | null>(jobId);
  jobIdRef.current = jobId;

  const rawRow = usePolling<Correction>(
    () => api<Correction>(`/corrections/${jobId}`),
    active,
  );
  // rawRow can still hold the previous job's data for one render after a new
  // job starts (usePolling's internal state isn't cleared on activation), so
  // gate it on the current jobId before treating it as "the" row.
  const row = rawRow?.id === jobId ? rawRow : null;

  // settled/active are derived from `row`, which only ever reflects data that
  // passed through usePolling's own `stopped` guard — never a mirrored,
  // separately-raced side effect.
  useEffect(() => {
    if (row && (row.status === "done" || row.status === "error")) {
      setActive(false);
    }
  }, [row]);

  // The tabs all stay mounted (App.tsx just toggles `hidden`), so a
  // mount-only effect would only ever see the settings that existed on
  // first load. Re-running this whenever the tab becomes visible again
  // picks up a changed default without requiring a full page refresh.
  // Skipped once a correction has been submitted so returning to the tab
  // doesn't silently swap the cli/model shown next to an in-flight or
  // already-answered job.
  useEffect(() => {
    if (!visible) return;
    api<Record<string, string>>("/settings").then((s) => {
      if (jobIdRef.current != null) return;
      if (s.default_cli) {
        setCli(s.default_cli);
        setModel(s[`default_model_${s.default_cli}`] ?? "");
      }
    });
  }, [visible]);

  const settled = row?.status === "done" || row?.status === "error";
  const busy = jobId != null && !settled;
  const result =
    row?.status === "done" ? safeParseResult(row.result_json) : null;
  const parseFailed =
    row?.status === "done" && row.result_json != null && result === null;

  const submit = () =>
    guard(async () => {
      if (!input.trim()) return;
      const { id } = await api<{ id: number }>("/corrections", {
        method: "POST",
        body: JSON.stringify({ input_text: input, cli, model }),
      });
      setJobId(id);
      setActive(true);
    });

  return (
    <div className="page">
      <div className="page-heading">
        <h2>문장 교정</h2>
        <p>원문과 교정 신호를 나란히 비교하고 표현을 노트로 보냅니다.</p>
      </div>

      {err && <ErrorAlert message={err} onDismiss={() => setErr(null)} />}

      <div className="correct-layout">
        <section className="section">
          <span className="console-label">원문 입력</span>
          <Field>
            <FieldLabel htmlFor="correct-input">교정받을 영어 문장</FieldLabel>
            <Textarea
              id="correct-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="예: I go to school yesterday."
            />
          </Field>

          <div className="section__row">
            <CliPicker
              cli={cli}
              model={model}
              onChange={(c, m) => {
                setCli(c);
                setModel(m);
              }}
            />
            <Button
              onClick={submit}
              disabled={busy || !input.trim()}
              aria-busy={busy}
            >
              {busy && <Spinner aria-label="교정 처리 중" />}
              {busy ? "요청 처리 중" : "교정 요청"}
            </Button>
            {row && <StatusBadge status={row.status === 'verifying' ? 'running' : row.status} label={row.status === 'verifying' ? '검증 중' : undefined} />}
          </div>
        </section>

        <section aria-live="polite" className="section">
          <span className="console-label">교정 결과</span>
          {jobId == null && (
            <ActionEmpty message="영어 문장을 입력하고 교정 요청을 보내면 결과가 이 채널에 표시됩니다." />
          )}
          {busy && !row && <ListSkeleton rows={3} />}
          {row?.status === "error" && (
            <ErrorAlert
              message={row.error_message ?? "교정 중 오류가 발생했습니다."}
            />
          )}
          {row?.status === "error" && row.raw_output && (
            <details className="raw-output">
              <summary>원문 보기</summary>
              <pre>{row.raw_output}</pre>
            </details>
          )}

          {parseFailed && <ErrorAlert message="결과를 표시할 수 없습니다." />}
          {parseFailed && row?.raw_output && (
            <details className="raw-output">
              <summary>원문 보기</summary>
              <pre>{row.raw_output}</pre>
            </details>
          )}

          {result && (
            <div className="attempt-result">
              <div>
                <h3>교정문</h3>
                <p className="correct-result__text">
                  {result.corrected} <SaveToNote text={result.corrected} />
                </p>
              </div>
              <div>
                <h3>대안 표현</h3>
                <ul className="row-list">
                  {result.alternatives.map((a, i) => (
                    <li key={i} className="row-list__item">
                      <div className="row-list__main">
                        <span className="row-list__text">{a.text}</span>
                        <span className="row-list__meta">{a.note_ko}</span>
                      </div>
                      <div className="row-list__actions">
                        <SaveToNote text={a.text} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>설명</h3>
                <p>{result.explanation_ko}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
