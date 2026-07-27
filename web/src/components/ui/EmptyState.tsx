import type { ReactNode } from 'react';
import './EmptyState.css';

export default function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state__message">{message}</p>
      {action}
    </div>
  );
}
