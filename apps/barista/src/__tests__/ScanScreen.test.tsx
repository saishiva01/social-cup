import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ScanScreen } from '../components/ScanScreen';
import { ApiError } from '../lib/api';
import type * as ApiModule from '../lib/api';

const mockRedeem = vi.fn();
const mockToday = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('../lib/api');
  return { ...actual, redeem: (code: string) => mockRedeem(code), today: () => mockToday() };
});

describe('ScanScreen', () => {
  beforeEach(() => {
    mockRedeem.mockReset();
    mockToday.mockReset();
  });

  it('shows the green success screen with member, drink, and credits deducted — nothing else', async () => {
    mockRedeem.mockResolvedValue({
      memberFirstName: 'Ada',
      memberPhotoUrl: null,
      drinkName: 'Oat Milk Cortado',
      creditsDeducted: 5,
      redeemedAt: new Date().toISOString(),
    });
    render(<ScanScreen cafeName="Blackwood Roasting Co." onSessionExpired={vi.fn()} />);

    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'ABCD-EFGH-JKMN' } });
    fireEvent.click(screen.getByTestId('code-submit'));

    await waitFor(() => expect(screen.getByTestId('result-success')).toBeInTheDocument());
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Oat Milk Cortado')).toBeInTheDocument();
    expect(screen.getByText('5 credits deducted')).toBeInTheDocument();
    expect(mockRedeem).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
  });

  it('shows exactly one red-screen reason on failure, never a technical error', async () => {
    mockRedeem.mockRejectedValue(new ApiError(409, 'CONFLICT', 'Already redeemed'));
    render(<ScanScreen cafeName="Blackwood Roasting Co." onSessionExpired={vi.fn()} />);

    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'BOGUS' } });
    fireEvent.click(screen.getByTestId('code-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('result-failure')).toHaveTextContent('Already redeemed'),
    );
  });

  it('returns to the scan form after tapping the result away', async () => {
    mockRedeem.mockResolvedValue({
      memberFirstName: 'Ada',
      memberPhotoUrl: null,
      drinkName: 'Latte',
      creditsDeducted: 5,
      redeemedAt: new Date().toISOString(),
    });
    render(<ScanScreen cafeName="Blackwood Roasting Co." onSessionExpired={vi.fn()} />);
    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'CODE' } });
    fireEvent.click(screen.getByTestId('code-submit'));
    await waitFor(() => expect(screen.getByTestId('result-success')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('result-success'));
    expect(screen.getByTestId('code-input')).toBeInTheDocument();
  });

  it("loads and shows today's redemptions for this café", async () => {
    mockToday.mockResolvedValue([
      {
        id: 'r-1',
        memberFirstName: 'Ada',
        drinkName: 'Cortado',
        creditsDeducted: 5,
        redeemedAt: new Date().toISOString(),
      },
    ]);
    render(<ScanScreen cafeName="Blackwood Roasting Co." onSessionExpired={vi.fn()} />);

    fireEvent.click(screen.getByTestId('today-toggle'));

    await waitFor(() => expect(screen.getByTestId('today-list')).toBeInTheDocument());
    expect(screen.getByText('Cortado')).toBeInTheDocument();
  });

  it('routes back to the PIN screen instead of showing a dead-end red screen when the trusted-device session has expired', async () => {
    mockRedeem.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Session expired'));
    const onSessionExpired = vi.fn();
    render(<ScanScreen cafeName="Blackwood Roasting Co." onSessionExpired={onSessionExpired} />);

    fireEvent.change(screen.getByTestId('code-input'), { target: { value: 'CODE' } });
    fireEvent.click(screen.getByTestId('code-submit'));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    expect(screen.queryByTestId('result-failure')).toBeNull();
  });
});
