import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  it('exposes logout without leaving the settings surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    const onLogout = vi.fn();
    render(<SettingsPage onLogout={onLogout} />);

    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  });
});
