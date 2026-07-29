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
      if (path === '/meta/clis') return [{ name: 'codex', label: 'Codex', models: ['gpt'] }];
      if (path === '/attempts' && init?.method === 'POST') {
        expect(JSON.parse(init.body as string)).toMatchObject({
          question_id: 7,
          script_text: 'I had a quiet day at home.',
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
