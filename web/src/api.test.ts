import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

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
});
