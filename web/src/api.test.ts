import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

describe('api request headers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not label a bodyless POST as JSON', async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 204, ok: true });
    vi.stubGlobal('fetch', fetch);

    await api('/auth/logout', { method: 'POST' });

    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: undefined,
    });
  });

  it('preserves structured API error codes and details for recovery actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 409,
      statusText: 'Conflict',
      ok: false,
      json: async () => ({ error: '진행 중인 훈련이 있습니다.', code: 'ACTIVE_TRAINING_SESSION', session_id: 7 }),
    }));

    await expect(api('/training/sessions', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      message: '진행 중인 훈련이 있습니다.',
      status: 409,
      code: 'ACTIVE_TRAINING_SESSION',
      details: { session_id: 7 },
    } satisfies Partial<ApiError>);
  });
});
