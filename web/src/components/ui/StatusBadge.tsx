import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'done' | 'error';
const LABELS: Record<Status, string> = { pending: '대기 중', running: '처리 중', done: '완료', error: '오류' };

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const normalized: Status = status in LABELS ? (status as Status) : 'pending';
  return (
    <Badge
      variant={normalized === 'error' ? 'destructive' : 'outline'}
      className={cn('status-badge', `status-badge--${normalized}`)}
    >
      <span className="status-badge__dot" aria-hidden="true" />
      {label ?? LABELS[normalized]}
    </Badge>
  );
}
