import './StatusPill.css';

type Status = 'pending' | 'running' | 'done' | 'error';

const LABELS: Record<Status, string> = {
  pending: '대기 중',
  running: '처리 중',
  done: '완료',
  error: '오류',
};

export default function StatusPill({ status }: { status: string }) {
  const s: Status = status in LABELS ? (status as Status) : 'pending';
  return (
    <span className={`status-pill status-pill--${s}`}>
      <span className="status-pill__dot" aria-hidden="true" />
      {LABELS[s]}
    </span>
  );
}
