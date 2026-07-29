import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('shows progress while evaluating', () => {
    render(
      <AttemptResult
        row={{ ...base, status: 'evaluating', transcript: 't', result_json: null, error_message: null } as Attempt}
      />,
    );
    expect(screen.getByText(/평가 중/)).toBeTruthy();
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

  it('falls back to an error message when result_json is malformed', () => {
    render(
      <AttemptResult
        row={{ ...base, status: 'done', transcript: 't', result_json: '{not json', error_message: null } as Attempt}
      />,
    );
    expect(screen.getByText(/결과를 표시할 수 없습니다/)).toBeTruthy();
  });
});
