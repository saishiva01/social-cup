import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CafesPage } from '../routes/CafesPage';

const getCafes = vi.fn();

vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({ api: { getCafes } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CafesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CafesPage', () => {
  it('shows an empty state when there are no cafes', async () => {
    getCafes.mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/no cafes yet/i)).toBeInTheDocument());
  });

  it('renders a row per cafe with its payout rate and PIN status', async () => {
    getCafes.mockResolvedValueOnce({
      items: [
        {
          id: 'cafe-1',
          name: 'Blackwood',
          neighborhood: 'Bishop Arts',
          featured: true,
          payoutRateCents: 70,
          pinIsSet: true,
          drinkCount: 3,
          updatedAt: new Date().toISOString(),
        },
      ],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Blackwood')).toBeInTheDocument());
    expect(screen.getByText('$0.70/credit')).toBeInTheDocument();
  });

  it('shows an error state when the list fails to load', async () => {
    getCafes.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
