import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../api';
import { checkDrillAnswer } from '../lib/drillCheck';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import ErrorAlert from '@/components/ui/ErrorAlert';
import ActionEmpty from '@/components/ui/ActionEmpty';
import type { DrillItem, DrillResult } from '../types';

type Phase = 'answering' | 'mismatch';

function DiffLine({ diff }: { diff: ReturnType<typeof checkDrillAnswer>['diff'] }) {
  return (
    <p className="diff-text" aria-label="기준 예문과 비교">
      {diff.map((token, index) => {
        if (token.type === 'delete') {
          return <del key={index} className="diff-text__delete">{token.text}</del>;
        }
        if (token.type === 'insert') {
          return <ins key={index} className="diff-text__insert">{token.text}</ins>;
        }
        return <span key={index}>{token.text}</span>;
      })}
    </p>
  );
}

export default function SpeedDrillPage({ visible = true }: { visible?: boolean }) {
  const [items, setItems] = useState<DrillItem[] | null>(null);
  const [totalEligible, setTotalEligible] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState<Phase>('answering');
  const [results, setResults] = useState<DrillResult[]>([]);
  const [round, setRound] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ items: DrillItem[]; total_eligible: number }>('/training/drill?limit=10');
      setItems(data.items);
      setTotalEligible(data.total_eligible);
      setIndex(0);
      setAnswer('');
      setPhase('answering');
      setResults([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && items === null && !loading) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, round]);

  const current = items?.[index] ?? null;

  const record = (sentenceId: number, result: DrillResult, answerText: string) => {
    void api('/training/drill/results', {
      method: 'POST',
      body: JSON.stringify({ sentence_id: sentenceId, result, answer_text: answerText }),
    }).catch(() => { /* fire-and-forget: local progress does not depend on this succeeding */ });
  };

  const advance = () => {
    setAnswer('');
    setPhase('answering');
    if (items && index < items.length - 1) setIndex(index + 1);
    else setIndex((items?.length ?? 0));
  };

  const submit = () => {
    if (!current || !answer.trim()) return;
    const check = checkDrillAnswer(answer, current.reference_en);
    if (check.exact) {
      record(current.id, 'exact', answer);
      setResults((values) => [...values, 'exact']);
      advance();
    } else {
      setPhase('mismatch');
    }
  };

  const judge = (result: 'self_pass' | 'wrong') => {
    if (!current) return;
    record(current.id, result, answer);
    setResults((values) => [...values, result]);
    advance();
  };

  if (error) {
    return (
      <section className="section training-start">
        <ErrorAlert message={error} onDismiss={() => setError(null)} />
        <Button onClick={() => void load()}>다시 시도</Button>
      </section>
    );
  }

  if (loading || items === null) {
    return (
      <section className="section training-loading" aria-live="polite">
        <Spinner aria-label="순간영작 문제 준비 중" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="section">
        <ActionEmpty message="아직 순간영작에 쓸 문장이 없습니다. 훈련 세션을 먼저 완료해 주세요." />
      </section>
    );
  }

  if (!current) {
    const exact = results.filter((r) => r === 'exact').length;
    const selfPass = results.filter((r) => r === 'self_pass').length;
    const wrong = results.filter((r) => r === 'wrong').length;
    return (
      <section className="section training-complete" aria-live="polite">
        <div className="training-complete__mark"><Check aria-hidden="true" /></div>
        <div>
          <h3>순간영작 완료</h3>
          <p>총 {totalEligible}개 중 {items.length}문장을 풀었습니다.</p>
        </div>
        <dl className="training-summary">
          <div><dt>정확히 일치</dt><dd>{exact}</dd></div>
          <div><dt>맞은 걸로</dt><dd>{selfPass}</dd></div>
          <div><dt>틀림</dt><dd>{wrong}</dd></div>
        </dl>
        <Button onClick={() => setRound((r) => r + 1)}>한 번 더</Button>
      </section>
    );
  }

  const check = phase === 'mismatch' ? checkDrillAnswer(answer, current.reference_en) : null;

  return (
    <div className="training-flow">
      <div className="training-progress" aria-live="polite">
        <span>문장 {index + 1} / {items.length}</span>
        <progress aria-label="순간영작 진행률" value={index} max={items.length} />
      </div>

      <section className="section training-prompt">
        <div className="training-intent">
          <span>한국어 의도</span>
          <p>{current.intent_ko}</p>
        </div>
        {current.focus_ko && (
          <div className="training-focus">
            <span>학습 초점</span>
            <p>{current.focus_ko}</p>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="drill-answer">영어 문장</FieldLabel>
          <Input
            id="drill-answer"
            value={answer}
            disabled={phase === 'mismatch'}
            placeholder="한국어 의도를 영어로 바로 써 보세요."
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && phase === 'answering') submit();
            }}
          />
        </Field>

        {phase === 'answering' && (
          <Button onClick={submit} disabled={!answer.trim()}>확인</Button>
        )}

        {phase === 'mismatch' && check && (
          <div className="training-comparison">
            <DiffLine diff={check.diff} />
            <div className="training-comparison__row training-comparison__row--reference">
              <span>기준 예문과 비교</span>
              <p>{current.reference_en}</p>
            </div>
            <div className="section__row">
              <Button variant="outline" onClick={() => judge('self_pass')}>
                <Check aria-hidden="true" /> 맞은 걸로
              </Button>
              <Button variant="outline" onClick={() => judge('wrong')}>
                <X aria-hidden="true" /> 틀림
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
