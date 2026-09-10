import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, verifyEmail } from '../lib/api';
import type * as ApiModule from '../lib/api';
import { VerifyEmailPage } from '../routes/VerifyEmailPage';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, verifyEmail: vi.fn() };
});

beforeEach(() => {
  vi.mocked(verifyEmail).mockReset();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyEmailPage', () => {
  it('shows a loading state, then success, for a valid token', async () => {
    vi.mocked(verifyEmail).mockResolvedValue({ emailVerified: true });

    renderAt('/verify-email?token=valid-token');

    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/email verified/i)).toBeInTheDocument());
    expect(verifyEmail).toHaveBeenCalledWith('valid-token');
  });

  it('shows an error state when the API rejects the token', async () => {
    vi.mocked(verifyEmail).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'This verification link is invalid or has expired.'),
    );

    renderAt('/verify-email?token=bad-token');

    await waitFor(() => expect(screen.getByText(/verification link invalid/i)).toBeInTheDocument());
  });

  it('shows an error state and never calls the API when the token is missing', async () => {
    renderAt('/verify-email');

    await waitFor(() => expect(screen.getByText(/verification link invalid/i)).toBeInTheDocument());
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
