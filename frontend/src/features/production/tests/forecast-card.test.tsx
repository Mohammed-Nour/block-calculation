import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import type { Forecast } from '@/api';
import { ForecastCard } from '@/features/production/components/forecast-card';

it('explains incomplete run coverage without asking for molds that already exist', () => {
  const forecast: Forecast = {
    full: { quantity: 120, molds: 50, cycles: 1, expected_ready_at: null },
    half: { quantity: 0, molds: 0, cycles: 0, expected_ready_at: null },
    expected_ready_at: null,
    duration_hours: null,
    untimed_sizes: ['full'],
  };
  render(<ForecastCard forecast={forecast} />);
  expect(
    screen.getByText('The production plan is incomplete'),
  ).toBeInTheDocument();
  expect(screen.getByText(/saved runs do not cover/)).toBeInTheDocument();
  expect(screen.queryByText('Add molds in Settings')).not.toBeInTheDocument();
});
