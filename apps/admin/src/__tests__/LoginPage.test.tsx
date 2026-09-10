import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { LoginPage } from '../routes/LoginPage';
import { ApiError } from '../lib/api';

const login = vi.fn();

vi.mock('../contexts/auth-context', () => ({
  useAuth: () => ({ status: 'unauthenticated', login }),
}));

describe('LoginPage', () => {
  it('shows the server error message on a rejected login', async () => {
    login.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password'));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@socialcup.dev' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'),
    );
    expect(login).toHaveBeenCalledWith('admin@socialcup.dev', 'wrong');
  });
});
