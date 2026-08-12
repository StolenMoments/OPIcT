import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import PracticePage from './PracticePage';

vi.mock('../api', () => ({ api: vi.fn() }));

const recorderScenario = vi.hoisted(() => ({ failStart: false }));

vi.mock('../hooks/useRecorder', async () => {
  const React = await import('react');
  return {
    useRecorder() {
      const [recording, setRecording] = React.useState(false);
      const [error, setError] = React.useState<string | null>(null);
      return {
        recording,
        elapsedSec: 3,
        error,
        start: async () => {
          if (recorderScenario.failStart) {
            setError('마이크 권한이 거부되었습니다.');
            throw new Error('마이크 권한이 거부되었습니다.');
          }
          setRecording(true);
        },
        stop: async () => new Blob(['audio'], { type: 'audio/webm' }),
      };
    },
  };
});

describe('PracticePage representative recording flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recorderScenario.failStart = false;
  });
  afterEach(cleanup);

  it('keeps a visible transmission signal while the recorded answer uploads', async () => {
    let finishUpload: ((value: { id: number }) => void) | undefined;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/settings') return {};
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1') {
        return [{ id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' }];
      }
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt'] }];
      if (path === '/attempts' && init?.method === 'POST') {
        return new Promise<{ id: number }>((resolve) => {
          finishUpload = resolve;
        });
      }
      return null;
    });

    render(<PracticePage />);

    fireEvent.click(await screen.findByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));
    fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    fireEvent.click(await screen.findByRole('button', { name: '녹음 종료·제출' }));

    expect(await screen.findByRole('status', { name: '답변 신호 전송 중' })).toBeInTheDocument();

    finishUpload?.({ id: 91 });
  });

  it('submits a typed script directly for evaluation, skipping recording', async () => {
    let finishSubmit: ((value: { id: number }) => void) | undefined;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/settings') return {};
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1') {
        return [{ id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' }];
      }
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt-5', 'gpt-4'] }];
      if (path === '/attempts' && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toMatchObject({
          question_id: 7,
          script_text: 'I had a quiet day at home.',
          cli: 'codex',
          model: 'gpt-5',
        });
        return new Promise<{ id: number }>((resolve) => {
          finishSubmit = resolve;
        });
      }
      return null;
    });

    render(<PracticePage />);

    fireEvent.click(await screen.findByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));
    fireEvent.click(await screen.findByRole('tab', { name: '텍스트로 입력' }));
    fireEvent.change(screen.getByRole('textbox', { name: '답변 스크립트' }), {
      target: { value: 'I had a quiet day at home.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '스크립트 제출' }));

    expect(await screen.findByRole('status', { name: '답변 신호 전송 중' })).toBeInTheDocument();

    finishSubmit?.({ id: 91 });
  });

  it('keeps CLI selection but hides model selection on the practice screen', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return { default_cli: 'codex', default_model_codex: 'gpt-5' };
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1') {
        return [{ id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' }];
      }
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt-5'] }];
      return null;
    });

    render(<PracticePage />);

    fireEvent.click(await screen.findByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));

    expect(await screen.findByRole('combobox', { name: 'CLI 선택' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '모델 선택' })).not.toBeInTheDocument();
  });

  it('defaults new questions to the saved default input mode', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return { default_input_mode: 'text' };
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1') {
        return [
          { id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' },
          { id: 8, category_id: 1, text: 'Tell me about your weekend.', note: null, created_at: '' },
        ];
      }
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt'] }];
      return null;
    });

    render(<PracticePage />);

    fireEvent.click(await screen.findByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));

    expect(await screen.findByRole('tab', { name: '텍스트로 입력', selected: true })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '문항 목록으로' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your weekend.' }));

    expect(await screen.findByRole('tab', { name: '텍스트로 입력', selected: true })).toBeInTheDocument();
  });

  it('applies a changed default input mode after returning to the tab, without a full remount', async () => {
    // App.tsx keeps every tab mounted and toggles `hidden`, so PracticePage
    // never unmounts when the user visits Settings and comes back — the
    // settings-fetch effect must re-run on the `visible` prop, not just on
    // first mount, for a saved default to take effect without a page reload.
    let settingsResponse: Record<string, string> = { default_input_mode: 'record' };
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return settingsResponse;
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1') {
        return [{ id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' }];
      }
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt'] }];
      return null;
    });

    const { rerender } = render(<PracticePage visible />);
    await screen.findByRole('combobox', { name: '카테고리 선택' });

    settingsResponse = { default_input_mode: 'text' };
    rerender(<PracticePage visible={false} />);
    rerender(<PracticePage visible />);

    fireEvent.click(screen.getByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));

    expect(await screen.findByRole('tab', { name: '텍스트로 입력', selected: true })).toBeInTheDocument();
  });

  it('shows a microphone denial only once', async () => {
    recorderScenario.failStart = true;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/settings') return {};
      if (path === '/categories') return [{ id: 1, type: 'survey', name: '일상', sort_order: 0 }];
      if (path === '/questions?category_id=1')
        return [{ id: 7, category_id: 1, text: 'Tell me about your day.', note: null, created_at: '' }];
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt'] }];
      return null;
    });

    render(<PracticePage />);
    fireEvent.click(await screen.findByRole('combobox', { name: '카테고리 선택' }));
    fireEvent.click(await screen.findByRole('option', { name: '[서베이] 일상' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tell me about your day.' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '녹음 시작' }));
    });

    expect(screen.getAllByText('마이크 권한이 거부되었습니다.')).toHaveLength(1);
  });
});
