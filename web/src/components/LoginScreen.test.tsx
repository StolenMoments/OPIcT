import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import LoginScreen from './LoginScreen';

describe('LoginScreen', () => {
  afterEach(cleanup);

  it('shows the simplified password prompt without broadcast copy', () => {
    render(<LoginScreen onLogin={vi.fn()} />);

    expect(screen.getByRole('heading', { name: '비밀번호 입력하세요.' })).toBeInTheDocument();
    expect(screen.queryByText('방송 부스에 입장하세요')).not.toBeInTheDocument();
    expect(screen.queryByText(/개인 연습 신호/)).not.toBeInTheDocument();
  });

  it('submits the entered password before revealing the app', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginScreen onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(onLogin).toHaveBeenCalledWith('secret');
  });
});
