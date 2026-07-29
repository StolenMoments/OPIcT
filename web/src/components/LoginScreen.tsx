import { useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

export default function LoginScreen({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError('');
    try {
      await onLogin(password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '로그인에 실패했습니다');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-screen__panel" onSubmit={submit}>
        <div className="auth-screen__intro">
          <span className="auth-screen__brand">
            <Radio aria-hidden="true" /> OPIcT
          </span>
          <h1>방송 부스에 입장하세요</h1>
          <p>개인 연습 신호를 이어가려면 비밀번호를 입력하세요.</p>
        </div>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="opict-password">비밀번호</FieldLabel>
          <Input
            id="opict-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            aria-invalid={Boolean(error)}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <Button type="submit" className="auth-screen__submit" disabled={!password || pending} aria-busy={pending}>
          {pending && <Spinner aria-label="로그인 처리 중" />}
          로그인
        </Button>
      </form>
    </main>
  );
}
