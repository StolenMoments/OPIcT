import type { ReactNode } from 'react';
import { RadioTower } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';

export default function ActionEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Empty className="action-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RadioTower aria-hidden="true" />
        </EmptyMedia>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
