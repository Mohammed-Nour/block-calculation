import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, apiKeys } from '@/api';
import type { ProjectDetail } from '@/api';
import { EstimateSection } from '@/features/estimates/components/estimate-section';
import { renderWithQuery } from '@/tests/utils/render-with-query';

async function configure(cement = '100') {
  const current = await api.getSettings();
  await api.updateSettings({
    version: current.version,
    currency: 'RUB',
    sand_price_per_ton: '10',
    stone_price_per_ton: '20',
    cement_price_per_ton: cement,
    full_molds: 50,
    half_molds: 15,
    sand_kg_per_wheelbarrow: '100',
    stone_kg_per_wheelbarrow: '120',
    mix_yields: ([1, 2, 3, 4] as const).map((id) => ({
      id,
      full_yield: 35,
      half_yield: 60,
    })),
    confirmed_zero_prices: [],
  });
}

let detail: ProjectDetail;

beforeEach(async () => {
  window.localStorage.clear();
  await configure();
  const created = await api.createProject({
    name: 'Wall',
    requested_start_at: '2026-12-01T08:00:00+03:00',
    full_quantity: 1700,
    half_quantity: 300,
    mix_id: 2,
  });
  detail = await api.saveEstimate(created.project.id, {
    project_version: created.project.version,
    use_current_prices: false,
  });
});

function renderSection() {
  const { queryClient } = renderWithQuery(<EstimateSection detail={detail} />, [
    [apiKeys.project(detail.project.id), detail],
  ]);
  return queryClient;
}

const total = () =>
  within(screen.getByRole('row', { name: /Total material cost/ })).getByText(
    /RUB/,
  );

describe('EstimateSection', () => {
  it('shows saved cost and an explanation when snapshot mix details are missing', () => {
    const revision = detail.estimates[0];
    if (!revision) throw new Error('expected saved revision');
    revision.inputs.mix = null;
    renderSection();
    expect(total()).toHaveTextContent('691.20 RUB');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Mix details are missing from this saved revision.',
    );
  });
  it('AT03 and AT05: shows the saved 691.20 RUB even after a price change', async () => {
    await configure('120');
    renderSection();
    expect(total()).toHaveTextContent('691.20 RUB');
    expect(screen.getByText('Revision 1')).toBeInTheDocument();
  });

  it('FR17: recalculating with current prices adds a revision and keeps the old one', async () => {
    const user = userEvent.setup();
    await configure('120');
    const queryClient = renderSection();
    await user.click(
      screen.getByRole('button', { name: 'Recalculate with current prices' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Recalculate' }),
    );

    const updated = queryClient.getQueryData<ProjectDetail>(
      apiKeys.project(detail.project.id),
    );
    expect(updated?.estimates.map((e) => e.results.total_cost)).toEqual([
      '691.20',
      '745.20',
    ]);
  });
});
