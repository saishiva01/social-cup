import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { App } from '../App';
import { ApiError } from '../lib/api';
import type * as ApiModule from '../lib/api';

const mockToday = vi.fn();
const mockRedeem = vi.fn();
const mockReadCafeId = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('../lib/api');
  return { ...actual, today: () => mockToday(), redeem: (code: string) => mockRedeem(code) };
});

vi.mock('@/lib/cafeId', () => ({
  readCafeIdFromLocation: () => mockReadCafeId(),
}));

describe('App', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockToday.mockReset();
    mockRedeem.mockReset();
    mockReadCafeId.mockReset();
  });

  it('shows a friendly message when the URL carries no café id', async () => {
    mockReadCafeId.mockReturnValue(null);
    render(<App />);
    await waitFor(() => expect(screen.getByText(/missing a café/i)).toBeInTheDocument());
  });

  it('shows the PIN screen when this device has no trusted session yet', async () => {
    mockReadCafeId.mockReturnValue('11111111-1111-1111-1111-111111111111');
    mockToday.mockRejectedValue(new Error('unauthorized'));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pin-input')).toBeInTheDocument());
  });

  it('skips straight to scanning when this device is already trusted', async () => {
    mockReadCafeId.mockReturnValue('11111111-1111-1111-1111-111111111111');
    mockToday.mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeInTheDocument());
  });

  it('returns to the PIN screen (same café) after a session expires mid-shift', async () => {
    mockReadCafeId.mockReturnValue('11111111-1111-1111-1111-111111111111');
    mockToday.mockResolvedValue([]);
    mockRedeem.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Session expired'));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'CODE' } });
    fireEvent.click(screen.getByTestId('code-submit'));

    await waitFor(() => expect(screen.getByTestId('pin-input')).toBeInTheDocument());
  });
});
