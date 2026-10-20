import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SettingsPage from './SettingsPage';
import { ThemeProvider } from '../components/theme-provider';

describe('SettingsPage', () => {
  afterEach(cleanup);
  it('offers only CLI selection and saves it without a model', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/meta/clis') return { ok: true, status: 200, json: async () => [
        { name: 'codex', label: 'Codex', models: ['stale-model'] },
      ] };
      if (url === '/api/settings') return { ok: true, status: 200,
        json: async () => ({ default_cli: 'codex', default_model_codex: 'stale-model' }) };
      return { ok: true, status: 200, json: async () => [] };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ThemeProvider><SettingsPage onLogout={vi.fn()} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { name: '기본 CLI' })).toBeInTheDocument();
    const cli = await screen.findByRole('combobox', { name: 'CLI 선택' });
    await waitFor(() => expect(cli).toHaveTextContent('Codex'));
    expect(screen.queryByRole('combobox', { name: '모델 선택' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^저장$/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ default_cli: 'codex' }),
    })));
  });

  it('exposes logout without leaving the settings surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    const onLogout = vi.fn();
    render(
      <ThemeProvider>
        <SettingsPage onLogout={onLogout} />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  });

  it('saves the default input mode as soon as it is changed', async () => {
    const putCalls: Array<{ body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/settings' && init?.method === 'PUT') {
          putCalls.push({ body: init.body as string });
          return { ok: true, status: 200, json: async () => ({ default_input_mode: 'text' }) };
        }
        return { ok: true, status: 200, json: async () => [] };
      }),
    );
    render(
      <ThemeProvider>
        <SettingsPage onLogout={vi.fn()} />
      </ThemeProvider>,
    );

    const select = await screen.findByLabelText('입력 방식');
    fireEvent.change(select, { target: { value: 'text' } });

    await waitFor(() => expect(putCalls).toHaveLength(1));
    expect(JSON.parse(putCalls[0].body)).toEqual({ default_input_mode: 'text' });
    await waitFor(() => expect(select).toHaveValue('text'));
  });
});
