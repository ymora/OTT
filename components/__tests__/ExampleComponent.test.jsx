import { render, screen } from '@testing-library/react';
import ExampleComponent from '../ExampleComponent';

describe('ExampleComponent', () => {
  it('renders correctly', () => {
    render(<ExampleComponent />);
    expect(screen.getByText(/example/i)).toBeInTheDocument();
  });
});
