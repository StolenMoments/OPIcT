import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AttemptResult from './AttemptResult';
import type { Attempt } from '../types';

const base = {
  id: 1,
  question_id: 1,
  audio_path: 'x',
  input_mode: 'audio',
  cli: 'claude',
  model: 'm',
  created_at: '',
  raw_output: null,
} as Partial<Attempt>;

describe('AttemptResult', () => {
  afterEach(cleanup);

  it('shows progress while evaluating', () => {
    render(
      <AttemptResult
        row={{ ...base, status: 'evaluating', transcript: 't', result_json: null, error_message: null } as Attempt}
      />,
    );
    expect(screen.getByText(/평가 중/)).toBeTruthy();
  });

  it('shows progress while verifying', () => {
    render(
      <AttemptResult
        row={{ ...base, status: 'verifying', transcript: 't', result_json: null, error_message: null } as Attempt}
      />,
    );
    expect(screen.getByText(/검증 중/)).toBeTruthy();
  });

  it('renders feedback when done', () => {
    const result_json = JSON.stringify({
      summary_ko: '좋음',
      strengths_ko: ['a'],
      improvements_ko: ['b'],
      recommended_expressions: [{ text: 'x', note_ko: 'y' }],
    });
    render(
      <AttemptResult row={{ ...base, status: 'done', transcript: 't', result_json, error_message: null } as Attempt} />,
    );
    expect(screen.getByText('좋음')).toBeTruthy();
  });

  it('renders a word-level diff between the transcript and the corrected answer', () => {
    const result_json = JSON.stringify({
      summary_ko: '좋음',
      strengths_ko: ['a'],
      improvements_ko: ['b'],
      recommended_expressions: [{ text: 'x', note_ko: 'y' }],
      corrected_answer: 'I went to the park yesterday.',
    });
    render(
      <AttemptResult
        row={
          {
            ...base,
            status: 'done',
            transcript: 'I go to the park yesterday.',
            result_json,
            error_message: null,
          } as Attempt
        }
      />,
    );
    expect(screen.getByText('go')).toBeTruthy();
    expect(screen.getByText('went')).toBeTruthy();
  });

  it('renders each meaningful correction with before, after, and Korean reason', () => {
    const result_json = JSON.stringify({
      summary_ko: '좋음',
      strengths_ko: [],
      improvements_ko: [],
      recommended_expressions: [],
      corrected_answer: 'I went to the park yesterday.',
      correction_notes: [
        { before: 'go', after: 'went', reason_ko: 'yesterday가 과거 시점이라 과거형을 씁니다.' },
        { before: '', after: 'really ', reason_ko: '강조 표현을 추가합니다.' },
        { before: 'very ', after: '', reason_ko: '불필요한 수식어를 삭제합니다.' },
      ],
    });
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 'I go to the park yesterday.', result_json, error_message: null } as Attempt}
      />,
    );

    expect(screen.getByText('수정 이유')).toBeInTheDocument();
    expect(screen.getAllByText('go').length).toBeGreaterThan(0);
    expect(screen.getAllByText('went').length).toBeGreaterThan(0);
    expect(screen.getByText('yesterday가 과거 시점이라 과거형을 씁니다.')).toBeInTheDocument();
    expect(screen.getByText(/really/)).toBeInTheDocument();
    expect(screen.getByText('불필요한 수식어를 삭제합니다.')).toBeInTheDocument();
  });

  it('shows a no-meaningful-changes message for an empty correction note list', () => {
    const result_json = JSON.stringify({
      summary_ko: '좋음',
      strengths_ko: [],
      improvements_ko: [],
      recommended_expressions: [],
      corrected_answer: 'I went yesterday.',
      correction_notes: [],
    });
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 'I went yesterday.', result_json, error_message: null } as Attempt}
      />,
    );

    expect(screen.getByText('의미 있는 수정 사항이 없습니다.')).toBeInTheDocument();
  });

  it('keeps showing the existing diff for a legacy result without correction notes', () => {
    const result_json = JSON.stringify({
      summary_ko: '구기록',
      strengths_ko: [],
      improvements_ko: [],
      recommended_expressions: [],
      corrected_answer: 'I went yesterday.',
    });
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 'I go yesterday.', result_json, error_message: null } as Attempt}
      />,
    );

    expect(screen.getByText('구기록')).toBeInTheDocument();
    expect(screen.getByText('go')).toBeInTheDocument();
    expect(screen.getByText('went')).toBeInTheDocument();
  });

  it('treats a malformed correction note result as an invalid result', () => {
    const result_json = JSON.stringify({
      summary_ko: '좋음',
      strengths_ko: [],
      improvements_ko: [],
      recommended_expressions: [],
      correction_notes: [{ before: 'go', after: 42, reason_ko: '설명' }],
    });
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 'I go yesterday.', result_json, error_message: null } as Attempt}
      />,
    );

    expect(screen.getByText(/결과를 표시할 수 없습니다/)).toBeInTheDocument();
  });

  it('falls back to an error message when result_json is malformed', () => {
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 't', result_json: '{not json', error_message: null } as Attempt}
      />,
    );
    expect(screen.getByText(/결과를 표시할 수 없습니다/)).toBeTruthy();
  });
});
