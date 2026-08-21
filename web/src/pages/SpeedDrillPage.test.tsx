import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import SpeedDrillPage from './SpeedDrillPage';

vi.mock('../api', () => ({ api: vi.fn() }));

const items = [
  { id: 1, intent_ko: '나는 어제 공원에 갔다.', focus_ko: '과거 시제', reference_en: 'I went to the park yesterday.', mastery_status: 'learning' as const },
  { id: 2, intent_ko: '나는 2년째 조깅 중이다.', focus_ko: '현재완료진행형', reference_en: 'I have been jogging for two years.', mastery_status: 'mastered' as const },
];

describe('SpeedDrillPage', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('auto-advances on an exact normalized match, then requires a self-judgment on mismatch, and reports a summary', async () => {
    const posted: unknown[] = [];
    vi.mocked(api).mockImplementation(async (path, init) => {
      if (path === '/training/drill?limit=10') return { items, total_eligible: 2 };
      if (path === '/training/drill/results' && init?.method === 'POST') {
        posted.push(JSON.parse(init.body as string));
        return { id: posted.length };
      }
      return null;
    });

    render(<SpeedDrillPage visible />);

    expect(await screen.findByText('나는 어제 공원에 갔다.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), {
      target: { value: "i went to the park yesterday" },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('나는 2년째 조깅 중이다.')).toBeInTheDocument();
    expect(posted[0]).toMatchObject({ sentence_id: 1, result: 'exact' });

    fireEvent.change(screen.getByRole('textbox', { name: '영어 문장' }), {
      target: { value: 'I am jogging for two years.' },
    });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));

    expect(await screen.findByText('I have been jogging for two years.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '맞은 걸로' }));

    expect(await screen.findByRole('heading', { name: '순간영작 완료' })).toBeInTheDocument();
    expect(screen.getByText('정확히 일치')).toBeInTheDocument();
    expect(screen.getByText('맞은 걸로')).toBeInTheDocument();
    expect(posted[1]).toMatchObject({ sentence_id: 2, result: 'self_pass' });
  });

  it('shows an empty state when no sentence has finished a training session yet', async () => {
    vi.mocked(api).mockResolvedValue({ items: [], total_eligible: 0 });
    render(<SpeedDrillPage visible />);
    expect(await screen.findByText(/훈련 세션을 먼저 완료/)).toBeInTheDocument();
  });
});
