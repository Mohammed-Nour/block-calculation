import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, apiKeys } from '@/api';
import { ProjectForm } from '@/features/projects/components/project-form';
import { renderWithQuery } from '@/tests/utils/render-with-query';

beforeEach(() => {
  window.localStorage.clear();
});

async function renderForm() {
  const rootRoute = createRootRoute();
  const formRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ProjectForm />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([formRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const settings = await api.getSettings();
  renderWithQuery(<RouterProvider router={router} />, [
    [apiKeys.settings(), settings],
  ]);
  await screen.findByLabelText(/Project name/);
}

describe('ProjectForm', () => {
  it('AT02: calculating without a mix asks for one and shows no cost', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.clear(screen.getByLabelText(/Full blocks/));
    await user.type(screen.getByLabelText(/Full blocks/), '10');
    await user.click(screen.getByRole('button', { name: 'Calculate cost' }));

    expect(
      screen.getByText('Choose a mix to calculate the cost.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Total material cost')).not.toBeInTheDocument();
  });

  it('AT01: rejects an all-zero order', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.type(screen.getByLabelText(/Project name/), 'Wall');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(screen.getByLabelText(/Full blocks/)).toHaveAccessibleDescription(
      /at least one full or half block/,
    );
    expect(await api.listProjects()).toHaveLength(0);
  });

  it('SC02: lists missing settings instead of a cost', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.clear(screen.getByLabelText(/Full blocks/));
    await user.type(screen.getByLabelText(/Full blocks/), '10');
    await user.click(screen.getByRole('radio', { name: /Mix 2/ }));
    await user.click(screen.getByRole('button', { name: 'Calculate cost' }));

    expect(
      await screen.findByText(/some settings are missing/),
    ).toBeInTheDocument();
    expect(screen.getByText('sand price')).toBeInTheDocument();
    expect(screen.queryByText('Total material cost')).not.toBeInTheDocument();
  });
});
