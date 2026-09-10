import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { PinScreen } from '../components/PinScreen';
import { ApiError } from '../lib/api';
import type * as ApiModule from '../lib/api';

const mockAuthenticate = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('../lib/api');
  return {
    ...actual,
    authenticate: (cafeId: string, pin: string) => mockAuthenticate(cafeId, pin),
  };
});

describe('PinScreen', () => {
  beforeEach(() => {
    mockAuthenticate.mockReset();
  });

  it('calls onAuthenticated with the café name on a correct PIN', async () => {
    mockAuthenticate.mockResolvedValue({
      cafeId: 'cafe-1',
      cafeName: 'Blackwood Roasting Co.',
      trustedForSeconds: 1000,
    });
    const onAuthenticated = vi.fn();
    render(<PinScreen cafeId="cafe-1" onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('pin-submit'));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith('Blackwood Roasting Co.'));
    expect(mockAuthenticate).toHaveBeenCalledWith('cafe-1', '1234');
  });

  it('shows exactly one error reason for a wrong PIN and never calls onAuthenticated', async () => {
    mockAuthenticate.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Invalid PIN'));
    const onAuthenticated = vi.fn();
    render(<PinScreen cafeId="cafe-1" onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByTestId('pin-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('pin-submit'));

    await waitFor(() => expect(screen.getByTestId('pin-error')).toHaveTextContent('Invalid PIN'));
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('disables submit until a PIN is entered', () => {
    render(<PinScreen cafeId="cafe-1" onAuthenticated={vi.fn()} />);
    expect(screen.getByTestId('pin-submit')).toBeDisabled();
  });
});
