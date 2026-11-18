import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';
import type { ProjectDetail } from '@/api';
import { conflictError } from '@/api/errors';
import { CollectionSection } from '@/features/collection/components/collection-section';
import { renderWithQuery } from '@/tests/utils/render-with-query';

const detail = {
  project: { id: 1, status: 'partially_ready' },
  balance: {
    full: { requested: 20, ready: 10, collected: 4 },
    half: { requested: 0, ready: 0, collected: 0 },
  },
  collections: [],
} as unknown as ProjectDetail;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CollectionSection', () => {
  it('shows a failure that is not tied to a field', async () => {
    vi.spyOn(api, 'recordCollection').mockRejectedValueOnce(
      conflictError('This project changed. Reload it.', 3),
    );
    const user = userEvent.setup();
    renderWithQuery(<CollectionSection detail={detail} />);
    const full = screen.getByLabelText(/Full blocks collected now/);
    await user.clear(full);
    await user.type(full, '2');
    await user.click(screen.getByRole('button', { name: 'Record collection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This project changed. Reload it.',
    );
  });

  it('AT09: offers at most the 6 uncollected ready blocks and rejects 7', async () => {
    const user = userEvent.setup();
    renderWithQuery(<CollectionSection detail={detail} />);
    const full = screen.getByLabelText(/Full blocks collected now/);
    expect(full).toHaveAttribute('max', '6');
    expect(screen.getByText('6 ready to collect')).toBeInTheDocument();

    await user.clear(full);
    await user.type(full, '7');
    await user.click(screen.getByRole('button', { name: 'Record collection' }));
    expect(full).toHaveAccessibleDescription(/Only 6 ready full blocks/);
  });
});
