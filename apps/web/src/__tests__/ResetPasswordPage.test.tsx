import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, resetPassword } from '../lib/api';
import type * as ApiModule from '../lib/api';
import { ResetPasswordPage } from '../routes/ResetPasswordPage';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, resetPassword: vi.fn() };
});

beforeEach(() => {
  vi.mocked(resetPassword).mockReset();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage', () => {
  it('shows an invalid-link state and never calls the API when the token is missing', () => {
    renderAt('/reset-password');

    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('renders the new-password form when a token is present', () => {
    renderAt('/reset-password?token=valid-token');

    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('rejects a mismatched confirmation without calling the API', async () => {
    const user = userEvent.setup();
    renderAt('/reset-password?token=valid-token');

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-42');
    await user.type(screen.getByLabelText(/confirm new password/i), 'different-password');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('resets the password and shows success for a valid token', async () => {
    vi.mocked(resetPassword).mockResolvedValue({ message: 'ok' });
    const user = userEvent.setup();
    renderAt('/reset-password?token=valid-token');

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-42');
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-42');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeInTheDocument());
    expect(resetPassword).toHaveBeenCalledWith('valid-token', 'new-password-42');
  });

  it('shows an error state for an invalid or expired token', async () => {
    vi.mocked(resetPassword).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'This password reset link is invalid or has expired.'),
    );
    const user = userEvent.setup();
    renderAt('/reset-password?token=expired-token');

    await user.type(screen.getByLabelText(/^new password$/i), 'new-password-42');
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-42');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByText(/reset link invalid/i)).toBeInTheDocument());
  });
});
