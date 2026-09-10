import { fireEvent, render, screen } from '@testing-library/react-native';

import { PasswordField } from '../components/password-field';

describe('PasswordField', () => {
  it('masks the value by default and reveals it via the Show/Hide toggle', () => {
    render(
      <PasswordField label="Password" value="secret123" onChangeText={() => {}} testID="pw" />,
    );

    const input = screen.getByTestId('pw');
    expect(input.props.secureTextEntry).toBe(true);

    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(false);

    fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByTestId('pw').props.secureTextEntry).toBe(true);
  });

  it('shows a field-level error instead of the helper text', () => {
    render(
      <PasswordField
        label="Password"
        value=""
        onChangeText={() => {}}
        helperText="Minimum 8 characters."
        error="Use at least 8 characters."
      />,
    );

    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy();
    expect(screen.queryByText('Minimum 8 characters.')).toBeNull();
  });
});
