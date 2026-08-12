import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import TrainingPage from './TrainingPage';
import type { TrainingSession } from '../types';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: vi.fn() };
});

const firstItem = {
  id: 101,
  sentence_id: 11,
  position: 1,
  status: 'pending' as const,
  outcome: null,
  source_type: 'attempt' as const,
  source_id: 1,
  source_sentence: 'I go to the park yesterday.',
  intent_ko: '나는 어제 공원에 갔다.',
  focus_ko: '과거 시점을 나타내는 went 사용',
  mastery_status: 'learning' as const,
  answers: [],
};

const secondItem = {
  ...firstItem,
  id: 102,
  sentence_id: 12,
  position: 2,
  source_type: 'correction' as const,
  source_sentence: 'I am jogging since two years.',
  intent_ko: '나는 2년 동안 조깅을 해 오고 있다.',
  focus_ko: '현재완료진행형 사용',
};

function session(items: TrainingSession['items'], status: TrainingSession['status'] = 'in_progress'): TrainingSession {
  return {
    id: 1,
    status,
    error_code: null,
    error_message: null,
    created_at: '2026-08-12 12:00:00',
    completed_at: status === 'completed' ? '2026-08-12 12:10:00' : null,
    items,
    ...(status === 'completed'
      ? { summary: { first_try_pass: 1, hint_pass: 1, review: 0 } }
      : {}),
  };
}

describe('TrainingPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('runs hint, rewrite, comparison, next sentence, and completion transitions without leaking the reference early', async () => {
    let currentSession = session([firstItem, secondItem], 'ready');
    let answerSequence = 0;

    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/training/sessions' && init?.method === 'POST') return { id: 1 };
      if (path === '/training/sessions/1') return currentSession;
      if (path === '/training/items/101/answers' && init?.method === 'POST') {
        answerSequence += 1;
        return { id: answerSequence === 1 ? 201 : 202 };
      }
      if (path === '/training/answers/201') {
        const failed = {
          id: 201,
          session_item_id: 101,
          attempt_no: 1 as const,
          answer_text: 'I go to the park yesterday.',
          status: 'done' as const,
          error_message: null,
          created_at: '2026-08-12 12:01:00',
          verdict: {
            passes: false,
            areas: {
              meaning: { passes: true, feedback_ko: '의도는 전달됩니다.' },
              grammar: { passes: false, feedback_ko: '과거형이 필요합니다.' },
              naturalness: { passes: false, feedback_ko: '동사 형태를 다듬어 보세요.' },
              focus: { passes: false, feedback_ko: 'went를 사용해 보세요.' },
            },
            hint_ko: '끝난 과거 시점에는 go의 과거형을 사용해 보세요.',
          },
        };
        currentSession = session([{ ...firstItem, status: 'awaiting_revision', answers: [failed] }, secondItem]);
        return failed;
      }
      if (path === '/training/answers/202') {
        const passed = {
          id: 202,
          session_item_id: 101,
          attempt_no: 2 as const,
          answer_text: 'Yesterday, I went to the park.',
          status: 'done' as const,
          error_message: null,
          created_at: '2026-08-12 12:02:00',
          reference_en: 'I went to the park yesterday.',
          verdict: {
            passes: true,
            areas: {
              meaning: { passes: true, feedback_ko: '의도가 전달됩니다.' },
              grammar: { passes: true, feedback_ko: '문법이 정확합니다.' },
              naturalness: { passes: true, feedback_ko: '자연스럽습니다.' },
              focus: { passes: true, feedback_ko: '학습 초점을 충족했습니다.' },
            },
          },
        };
        currentSession = session([
          { ...firstItem, status: 'completed', outcome: 'hint_pass', reference_en: 'I went to the park yesterday.', answers: [passed] },
          secondItem,
        ]);
        return passed;
      }
      if (path === '/training/items/102/answers' && init?.method === 'POST') return { id: 203 };
      if (path === '/training/answers/203') {
        const passed = {
          id: 203,
          session_item_id: 102,
          attempt_no: 1 as const,
          answer_text: 'I have been jogging for two years.',
          status: 'done' as const,
          error_message: null,
          created_at: '2026-08-12 12:04:00',
          reference_en: 'I have been jogging for two years.',
          verdict: {
            passes: true,
            areas: {
              meaning: { passes: true, feedback_ko: '의도가 전달됩니다.' },
              grammar: { passes: true, feedback_ko: '문법이 정확합니다.' },
              naturalness: { passes: true, feedback_ko: '자연스럽습니다.' },
              focus: { passes: true, feedback_ko: '학습 초점을 충족했습니다.' },
            },
          },
        };
        currentSession = session([
          { ...firstItem, status: 'completed', outcome: 'hint_pass', reference_en: 'I went to the park yesterday.', answers: [] },
          { ...secondItem, status: 'completed', outcome: 'first_try_pass', reference_en: 'I have been jogging for two years.', answers: [passed] },
        ], 'completed');
        return passed;
      }
      return null;
    });

    render(<TrainingPage onOpenCorrection={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '오늘의 문장 시작' }));

    expect(await screen.findByText('나는 어제 공원에 갔다.')).toBeInTheDocument();
    expect(screen.queryByText('I went to the park yesterday.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), {
      target: { value: 'I go to the park yesterday.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '첫 답안 확인' }));

    expect(await screen.findByText(/끝난 과거 시점/)).toBeInTheDocument();
    expect(screen.queryByText('I went to the park yesterday.')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '영어 문장' })).toHaveValue('I go to the park yesterday.');

    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), {
      target: { value: 'Yesterday, I went to the park.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '재작성 확인' }));

    expect(await screen.findByText('I went to the park yesterday.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 문장' }));
    expect(await screen.findByText('나는 2년 동안 조깅을 해 오고 있다.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), {
      target: { value: 'I have been jogging for two years.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '첫 답안 확인' }));
    await screen.findByText('I have been jogging for two years.');
    fireEvent.click(screen.getByRole('button', { name: '훈련 결과 보기' }));

    expect(await screen.findByRole('heading', { name: '오늘의 문장 완료' })).toBeInTheDocument();
    expect(screen.getByText('첫 시도 통과')).toBeInTheDocument();
    expect(screen.getByText('힌트 후 통과')).toBeInTheDocument();
    expect(screen.getByText('다시 볼 문장')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5문장 더' })).toBeInTheDocument();
  });

  it('guides empty history to free correction and missing model settings to Settings', async () => {
    const openCorrection = vi.fn();
    const openSettings = vi.fn();
    vi.mocked(api).mockRejectedValueOnce(new ApiError('기본 CLI와 모델을 설정해 주세요.', 400, 'TRAINING_SETTINGS_REQUIRED'));

    const { rerender } = render(<TrainingPage onOpenCorrection={openCorrection} onOpenSettings={openSettings} />);
    fireEvent.click(screen.getByRole('button', { name: '오늘의 문장 시작' }));
    fireEvent.click(await screen.findByRole('button', { name: '설정 열기' }));
    expect(openSettings).toHaveBeenCalledOnce();

    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/training/sessions' && init?.method === 'POST') return { id: 2 };
      if (path === '/training/sessions/2') {
        return {
          ...session([], 'empty'),
          id: 2,
          error_code: 'NO_SOURCE_RECORDS',
          error_message: '완료된 평가 또는 자유 교정 기록이 없습니다.',
        };
      }
      return null;
    });
    rerender(<TrainingPage key="empty-history" onOpenCorrection={openCorrection} onOpenSettings={openSettings} />);
    fireEvent.click(screen.getByRole('button', { name: '오늘의 문장 시작' }));
    fireEvent.click(await screen.findByRole('button', { name: '자유 교정 열기' }));
    expect(openCorrection).toHaveBeenCalledOnce();
  });

  it('preserves a failed answer and retries its grading', async () => {
    let currentSession = session([firstItem], 'ready');
    let retried = false;
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/training/sessions' && init?.method === 'POST') return { id: 1 };
      if (path === '/training/sessions/1') return currentSession;
      if (path === '/training/items/101/answers') return { id: 301 };
      if (path === '/training/answers/301' && !retried) {
        currentSession = session([{ ...firstItem, status: 'first_error', answers: [] }]);
        return {
          id: 301,
          session_item_id: 101,
          attempt_no: 1,
          answer_text: 'My saved answer.',
          status: 'error',
          error_message: 'CLI 실행 실패',
          created_at: '2026-08-12 12:00:00',
        };
      }
      if (path === '/training/answers/301/retry' && init?.method === 'POST') {
        retried = true;
        return { id: 301 };
      }
      if (path === '/training/answers/301' && retried) {
        return {
          id: 301,
          session_item_id: 101,
          attempt_no: 1,
          answer_text: 'My saved answer.',
          status: 'done',
          error_message: null,
          created_at: '2026-08-12 12:00:00',
          verdict: {
            passes: false,
            areas: {
              meaning: { passes: false, feedback_ko: '의도를 다시 확인하세요.' },
              grammar: { passes: false, feedback_ko: '문법을 확인하세요.' },
              naturalness: { passes: false, feedback_ko: '표현을 다듬으세요.' },
              focus: { passes: false, feedback_ko: '초점을 적용하세요.' },
            },
            hint_ko: '과거형을 사용해 보세요.',
          },
        };
      }
      return null;
    });

    render(<TrainingPage onOpenCorrection={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '오늘의 문장 시작' }));
    await screen.findByText(firstItem.intent_ko);
    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), { target: { value: 'My saved answer.' } });
    fireEvent.click(screen.getByRole('button', { name: '첫 답안 확인' }));

    expect(await screen.findByText('CLI 실행 실패')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '영어 문장' })).toHaveValue('My saved answer.');
    fireEvent.click(screen.getByRole('button', { name: '답안 다시 채점' }));
    expect(await screen.findByText('과거형을 사용해 보세요.')).toBeInTheDocument();
  });
});
