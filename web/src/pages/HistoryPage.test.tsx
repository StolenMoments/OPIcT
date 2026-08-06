import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import HistoryPage from './HistoryPage';

vi.mock('../api', () => ({ api: vi.fn() }));

const emptyPage = { items: [], total: 0, limit: 10, offset: 0 };
const attempts = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  question_id: 1,
  question_text: `Question ${index + 1}`,
  audio_path: null,
  input_mode: 'text' as const,
  transcript: `Answer ${index + 1}`,
  cli: 'claude',
  model: 'm',
  status: 'evaluating',
  result_json: null,
  raw_output: null,
  error_message: null,
  created_at: '',
}));

describe('HistoryPage pagination and search', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api).mockImplementation(async (path) => {
      const [resource, queryString] = path.split('?');
      const query = new URLSearchParams(queryString);
      const offset = Number(query.get('offset') ?? 0);
      const search = query.get('search') ?? '';
      if (resource === '/attempts') {
        const filtered = search
          ? attempts.filter((row) => row.question_text.toLowerCase().includes(search.toLowerCase()))
          : attempts;
        return { items: filtered.slice(offset, offset + 10), total: filtered.length, limit: 10, offset };
      }
      if (resource === '/corrections') return emptyPage;
      return emptyPage;
    });
  });

  it('requests ten records from offset zero and advances by ten', async () => {
    render(<HistoryPage />);

    expect(await screen.findByText('Question 1')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/attempts?limit=10&offset=0');
    expect(screen.getByRole('button', { name: '이전 페이지' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/attempts?limit=10&offset=10'));
    expect(await screen.findByText('Question 11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeDisabled();
  });

  it('resets offset and sends the current tab search term', async () => {
    render(<HistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: '다음 페이지' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/attempts?limit=10&offset=10'));

    fireEvent.change(screen.getByRole('searchbox', { name: '기록 검색' }), {
      target: { value: 'park' },
    });

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/attempts?limit=10&offset=0&search=park'));
  });

  it('clears the search and page when switching from evaluation to correction', async () => {
    render(<HistoryPage />);
    fireEvent.change(await screen.findByRole('searchbox', { name: '기록 검색' }), {
      target: { value: 'park' },
    });

    fireEvent.click(screen.getByRole('tab', { name: '교정' }));

    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/corrections?limit=10&offset=0'));
    expect(screen.getByRole('searchbox', { name: '기록 검색' })).toHaveValue('');
  });
});
