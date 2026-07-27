import './ErrorBanner.css';

export default function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="error-banner" role="alert" aria-live="polite">
      <span className="error-banner__text">{message}</span>
      {onDismiss && (
        <button type="button" className="error-banner__close" onClick={onDismiss} aria-label="에러 메시지 닫기">
          ×
        </button>
      )}
    </div>
  );
}
