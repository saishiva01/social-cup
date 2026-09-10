import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../routes/DashboardPage';

const getDashboardSummary = vi.fn();

vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({ api: { getDashboardSummary } }),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DashboardPage', () => {
  it('shows a loading state, then the dashboard summary', async () => {
    getDashboardSummary.mockResolvedValueOnce({
      totalMembers: 12,
      activeCafes: 3,
      redemptionsThisMonth: 40,
      creditsRedeemedThisMonth: 120,
      totalOwedToCafesThisMonthCents: 8400,
      totalMarginThisMonthCents: 3600,
    });

    renderWithQueryClient(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('$84.00')).toBeInTheDocument();
    expect(screen.getByText('$36.00')).toBeInTheDocument();
  });

  it('shows an error state when the summary fails to load', async () => {
    getDashboardSummary.mockRejectedValueOnce(new Error('boom'));

    renderWithQueryClient(<DashboardPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
