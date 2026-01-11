import React from 'react';
import { render, screen } from '@testing-library/react';
import DeviceDashboard from '@/components/DeviceDashboard';

describe('DeviceDashboard', () => {
  it('renders without crashing', () => {
    render(<DeviceDashboard />);
    expect(screen.getByText(/Tableau de bord des dispositifs USB/i)).toBeInTheDocument();
  });
});
