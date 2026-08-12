import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import CorrectPage from './CorrectPage';

vi.mock('../api', () => ({ api: vi.fn() }));

describe('CorrectPage default cli/model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('applies a changed default cli/model after returning to the tab, without a full remount', async () => {
    // App.tsx keeps every tab mounted and toggles `hidden`, so CorrectPage
    // never unmounts when the user visits Settings and comes back — the
    // settings-fetch effect must re-run on the `visible` prop, not just on
    // first mount, for a saved default to take effect without a page reload.
    let settingsResponse: Record<string, string> = { default_cli: 'codex', default_model_codex: 'gpt-5' };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return settingsResponse;
      if (path === '/meta/clis')
        return [
          { name: 'codex', label: 'Codex', models: ['gpt-5'] },
          { name: 'claude', label: 'Claude', models: ['claude-haiku-4-5-20251001'] },
        ];
      return null;
    });

    const { rerender } = render(<CorrectPage visible />);
    fireEvent.click(screen.getByRole('tab', { name: '자유 교정' }));
    const cliTrigger = await screen.findByRole('combobox', { name: 'CLI 선택' });
    await waitFor(() => expect(cliTrigger).toHaveTextContent('Codex'));

    settingsResponse = { default_cli: 'claude', default_model_claude: 'claude-haiku-4-5-20251001' };
    rerender(<CorrectPage visible={false} />);
    rerender(<CorrectPage visible />);

    await waitFor(() => expect(cliTrigger).toHaveTextContent('Claude'));
  });

  it('does not clobber the cli/model shown for an already-submitted correction', async () => {
    let settingsResponse: Record<string, string> = { default_cli: 'codex', default_model_codex: 'gpt-5' };
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/settings') return settingsResponse;
      if (path === '/meta/clis')
        return [
          { name: 'codex', label: 'Codex', models: ['gpt-5'] },
          { name: 'claude', label: 'Claude', models: ['claude-haiku-4-5-20251001'] },
        ];
      if (path === '/corrections' && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toMatchObject({
          input_text: 'I go to school yesterday.',
          cli: 'codex',
          model: 'gpt-5',
        });
        return { id: 1 };
      }
      if (path === '/corrections/1') return { id: 1, status: 'evaluating' };
      return null;
    });

    const { rerender } = render(<CorrectPage visible />);
    fireEvent.click(screen.getByRole('tab', { name: '자유 교정' }));
    const cliTrigger = await screen.findByRole('combobox', { name: 'CLI 선택' });
    await waitFor(() => expect(cliTrigger).toHaveTextContent('Codex'));

    fireEvent.change(screen.getByRole('textbox', { name: '교정받을 영어 문장' }), {
      target: { value: 'I go to school yesterday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '교정 요청' }));
    await screen.findByText('요청 처리 중');

    settingsResponse = { default_cli: 'claude', default_model_claude: 'claude-haiku-4-5-20251001' };
    rerender(<CorrectPage visible={false} />);
    rerender(<CorrectPage visible />);

    await Promise.resolve();
    expect(cliTrigger).toHaveTextContent('Codex');
  });

  it('keeps CLI selection but hides model selection on the correction screen', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return { default_cli: 'codex', default_model_codex: 'gpt-5' };
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt-5'] }];
      return null;
    });

    render(<CorrectPage />);
    fireEvent.click(screen.getByRole('tab', { name: '자유 교정' }));

    expect(await screen.findByRole('combobox', { name: 'CLI 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '모델 선택' })).not.toBeInTheDocument();
  });

  it('preserves an unfinished correction while switching between sentence modes', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return {};
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt-5'] }];
      return null;
    });
    render(<CorrectPage />);
    fireEvent.click(screen.getByRole('tab', { name: '자유 교정' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '교정받을 영어 문장' }), {
      target: { value: 'Keep this draft.' },
    });

    fireEvent.click(screen.getByRole('tab', { name: '훈련' }));
    fireEvent.click(screen.getByRole('tab', { name: '자유 교정' }));

    expect(screen.getByRole('textbox', { name: '교정받을 영어 문장' })).toHaveValue('Keep this draft.');
  });
});
