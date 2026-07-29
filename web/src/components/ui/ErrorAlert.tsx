import { OctagonAlert, X } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <Alert variant="destructive" aria-live="polite" className="error-alert">
      <OctagonAlert aria-hidden="true" />
      <AlertTitle>신호를 처리하지 못했습니다</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onDismiss && (
        <AlertAction>
          <Button type="button" variant="ghost" size="icon" onClick={onDismiss} aria-label="에러 메시지 닫기">
            <X />
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
