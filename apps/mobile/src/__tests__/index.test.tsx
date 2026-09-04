import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';

describe('HomeScreen', () => {
  it('renders the Social Cup title', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Social Cup')).toBeTruthy();
  });
});
