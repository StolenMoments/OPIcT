import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SettingsPage from './SettingsPage';
import { ThemeProvider } from '../components/theme-provider';

describe('SettingsPage', () => {
  it('exposes logout without leaving the settings surface', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] }));
    const onLogout = vi.fn();
    render(
      <ThemeProvider>
        <SettingsPage onLogout={onLogout} />
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledOnce());
  });
});
