import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { usePolling } from './usePolling';

function PollingHarness({ resetKey }: { resetKey: string }) {
  const value = usePolling<string>(
    () => Promise.resolve(resetKey),
    true,
    10_000,
    resetKey,
  );
  return <output>{value ?? 'loading'}</output>;
}

describe('usePolling reset key', () => {
  afterEach(cleanup);

  it('clears old data and fetches again when the query key changes', async () => {
    const { rerender } = render(<PollingHarness resetKey="page-1" />);
    expect(await screen.findByText('page-1')).toBeInTheDocument();

    rerender(<PollingHarness resetKey="page-2" />);
    await waitFor(() => expect(screen.getByText('page-2')).toBeInTheDocument());
    expect(screen.queryByText('page-1')).not.toBeInTheDocument();
  });
});
