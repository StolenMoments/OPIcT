import { useCallback, useState } from 'react';
import { api } from '../api';
import AttemptResult from '../components/AttemptResult';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import ActionEmpty from '@/components/ui/ActionEmpty';
import ErrorAlert from '@/components/ui/ErrorAlert';
import ListSkeleton from '@/components/ui/ListSkeleton';
import StatusBadge from '@/components/ui/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import type { Attempt, Correction, CorrectionResult, PaginatedResponse } from '../types';

type HistoryKind = 'attempts' | 'corrections';

const PAGE_SIZE = 10;

function historyPath(kind: HistoryKind, offset: number, search: string) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (search.trim()) params.set('search', search.trim());
  return `/${kind}?${params.toString()}`;
}

function safeParseCorrection(json: string | null): CorrectionResult | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<CorrectionResult>;
    if (
      typeof parsed.corrected !== 'string' ||
      !Array.isArray(parsed.alternatives) ||
      typeof parsed.explanation_ko !== 'string'
    ) {
      return null;
    }
    return parsed as CorrectionResult;
  } catch {
    return null;
  }
}

function statusKind(status: string): 'pending' | 'running' | 'done' | 'error' {
  if (status === 'done' || status === 'error') return status;
  if (status === 'uploaded' || status === 'pending') return 'pending';
  return 'running';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    uploaded: '대기 중',
    pending: '대기 중',
    transcribing: '전사 중',
    evaluating: '평가 중',
    running: '처리 중',
    done: '완료',
    error: '오류',
  };
  return labels[status] ?? status;
}

function isAttempt(row: Attempt | Correction): row is Attempt {
  return 'question_text' in row;
}

function CorrectionDetail({ row }: { row: Correction }) {
  if (row.status === 'error') {
    return (
      <div className="history-detail__content" aria-live="polite">
        <ErrorAlert message={row.error_message ?? '교정 중 오류가 발생했습니다.'} />
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
      <div className="history-detail__status" aria-live="polite">
        <StatusBadge status={statusKind(row.status)} />
        <span>{statusLabel(row.status)}…</span>
      </div>
    );
  }

  const result = safeParseCorrection(row.result_json);
  if (!result) {
    return (
      <div className="history-detail__content" aria-live="polite">
        <ErrorAlert message="교정 결과를 표시할 수 없습니다." />
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
    <div className="history-detail__content" aria-live="polite">
      <div>
        <h3>교정문</h3>
        <p className="history-detail__corrected">{result.corrected}</p>
      </div>
      <div>
        <h3>대안 표현</h3>
        <ul className="row-list">
          {result.alternatives.map((alternative, index) => (
            <li key={index} className="row-list__item">
              <div className="row-list__main">
                <span className="row-list__text">{alternative.text}</span>
                <span className="row-list__meta">{alternative.note_ko}</span>
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
  );
}

function HistoryRow({
  row,
  open,
  retrying,
  onToggle,
  onRetry,
}: {
  row: Attempt | Correction;
  open: boolean;
  retrying: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const attempt = isAttempt(row);
  const title = attempt ? (row.question_text ?? '문항') : row.input_text;
  const meta = `${row.cli} / ${row.model} · ${row.created_at}`;
  const detailId = `history-detail-${row.id}`;

  return (
    <li className="history-entry">
      <Collapsible open={open} onOpenChange={onToggle}>
        <CollapsibleTrigger
          render={<button type="button" className="history-entry__toggle" aria-controls={detailId} />}
        >
          <span className="history-entry__main">
            <span className="history-entry__title">{title}</span>
            <span className="history-entry__meta">{meta}</span>
          </span>
          <StatusBadge status={statusKind(row.status)} />
          <span className="history-entry__chevron" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent id={detailId} className="history-entry__detail">
          {attempt && row.audio_path && (
            <audio
              className="history-entry__audio"
              controls
              preload="none"
              src={`/api/attempts/${row.id}/audio`}
              aria-label="평가 녹음 다시 듣기"
            />
          )}
          {attempt ? <AttemptResult row={row} /> : <CorrectionDetail row={row} />}
          <div className="history-entry__actions">
            <Button size="sm" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
              {retrying && <Spinner aria-label="재시도 중" />}
              다시 시도
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export default function HistoryPage() {
  const [kind, setKind] = useState<HistoryKind>('attempts');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [correctionsError, setCorrectionsError] = useState<string | null>(null);

  const fetchAttempts = useCallback(async () => {
    try {
      const page = await api<PaginatedResponse<Attempt>>(historyPath('attempts', offset, search));
      setAttemptsError(null);
      return page;
    } catch (error) {
      setAttemptsError(error instanceof Error ? error.message : '평가 기록을 불러오지 못했습니다.');
      throw error;
    }
  }, [offset, search]);

  const fetchCorrections = useCallback(async () => {
    try {
      const page = await api<PaginatedResponse<Correction>>(historyPath('corrections', offset, search));
      setCorrectionsError(null);
      return page;
    } catch (error) {
      setCorrectionsError(error instanceof Error ? error.message : '교정 기록을 불러오지 못했습니다.');
      throw error;
    }
  }, [offset, search]);

  const resetKey = `${kind}:${offset}:${search}:${refresh}`;
  const attempts = usePolling<PaginatedResponse<Attempt>>(fetchAttempts, kind === 'attempts', 2000, resetKey);
  const corrections = usePolling<PaginatedResponse<Correction>>(fetchCorrections, kind === 'corrections', 2000, resetKey);
  const page = kind === 'attempts' ? attempts : corrections;
  const rows = page?.items ?? null;
  const total = page?.total ?? 0;
  const loadError = kind === 'attempts' ? attemptsError : correctionsError;

  const clearRowState = () => {
    setOpenId(null);
    setRetryingId(null);
    setRetryError(null);
  };

  const selectKind = (nextKind: HistoryKind) => {
    setKind(nextKind);
    setSearch('');
    setOffset(0);
    clearRowState();
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setOffset(0);
    clearRowState();
  };

  const retry = async (path: string, id: number) => {
    setRetryingId(id);
    setRetryError(null);
    try {
      await api(path, { method: 'POST' });
      setRefresh((current) => current + 1);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : '다시 시도하지 못했습니다.');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="page history-page">
      <div className="history-page__heading">
        <h2>기록</h2>
        <p className="muted">완료된 결과를 다시 확인하고, 필요하면 같은 요청을 다시 실행할 수 있습니다.</p>
      </div>

      <Tabs value={kind} onValueChange={(value) => selectKind(value as 'attempts' | 'corrections')}>
        <TabsList variant="line" aria-label="기록 종류">
          <TabsTrigger value="attempts">평가</TabsTrigger>
          <TabsTrigger value="corrections">교정</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="history-page__search">
        <label htmlFor="history-search">기록 검색</label>
        <Input
          id="history-search"
          type="search"
          value={search}
          placeholder={kind === 'attempts' ? '문항 검색' : '입력 문장 검색'}
          onChange={(event) => changeSearch(event.target.value)}
        />
      </div>

      {loadError && <ErrorAlert message={loadError} />}
      {retryError && <ErrorAlert message={retryError} onDismiss={() => setRetryError(null)} />}

      <section
        id="history-list"
        className="history-page__list"
        aria-label={kind === 'attempts' ? '평가 기록 목록' : '교정 기록 목록'}
      >
        {rows === null && <ListSkeleton rows={3} />}
        {rows !== null && rows.length === 0 && total === 0 && search && (
          <ActionEmpty
            message={`“${search}” 검색 결과가 없습니다.`}
            action={<Button size="sm" variant="outline" onClick={() => changeSearch('')}>검색어 지우기</Button>}
          />
        )}
        {rows !== null && rows.length === 0 && total === 0 && !search && (
          <ActionEmpty
            message={
              kind === 'attempts'
                ? '연습 탭에서 답변을 녹음하면 평가 기록이 여기에 남습니다.'
                : '교정 탭에서 영어 문장을 제출하면 교정 기록이 여기에 남습니다.'
            }
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectKind(kind === 'attempts' ? 'corrections' : 'attempts')}
              >
                {kind === 'attempts' ? '교정 기록 보기' : '평가 기록 보기'}
              </Button>
            }
          />
        )}
        {rows !== null && rows.length === 0 && total > 0 && (
          <ActionEmpty message="이 페이지에 표시할 기록이 없습니다." />
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="row-list history-list">
            {rows.map((row) => (
              <HistoryRow
                key={row.id}
                row={row}
                open={openId === row.id}
                retrying={retryingId === row.id}
                onToggle={() => setOpenId((current) => current === row.id ? null : row.id)}
                onRetry={() =>
                  retry(kind === 'attempts' ? `/attempts/${row.id}/retry` : `/corrections/${row.id}/retry`, row.id)
                }
              />
            ))}
          </ul>
        )}
      </section>

      <nav className="history-page__pagination" aria-label="기록 페이지 이동">
        <Button variant="outline" onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} disabled={offset === 0}>
          이전 페이지
        </Button>
        <span className="history-page__page-status" aria-live="polite">
          {Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 페이지
        </span>
        <Button variant="outline" onClick={() => setOffset((current) => current + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total}>
          다음 페이지
        </Button>
      </nav>
    </div>
  );
}
