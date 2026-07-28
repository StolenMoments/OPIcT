import { useState } from 'react';
import Button from './ui/Button';
import Field from './ui/Field';

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
          <span className="auth-screen__brand">OPIcT</span>
          <h1>다시 연습을 시작하세요</h1>
          <p>개인 학습 공간에 들어가려면 비밀번호를 입력하세요.</p>
        </div>
        <Field label="비밀번호" htmlFor="opict-password" error={error}>
          <input
            id="opict-password"
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </Field>
        <Button type="submit" variant="primary" className="auth-screen__submit" loading={pending} disabled={!password}>
          로그인
        </Button>
      </form>
    </main>
  );
}
