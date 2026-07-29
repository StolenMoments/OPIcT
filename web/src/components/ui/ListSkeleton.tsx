import { Skeleton } from '@/components/ui/skeleton';

export default function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="list-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="list-skeleton__row" key={index}>
          <Skeleton className="list-skeleton__line" />
          <Skeleton className="list-skeleton__meta" />
        </div>
      ))}
    </div>
  );
}
