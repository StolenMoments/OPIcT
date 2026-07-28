import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import App from './App';
import { api } from './api';

vi.mock('./api', () => ({ api: vi.fn() }));

describe('App authentication gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the practice app hidden until the session is authenticated', async () => {
    vi.mocked(api).mockResolvedValue({ authenticated: false });

    render(<App />);

    expect(screen.getByText('접속 확인 중...')).toBeInTheDocument();
    expect(await screen.findByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.queryByText('연습')).not.toBeInTheDocument();
  });
});
