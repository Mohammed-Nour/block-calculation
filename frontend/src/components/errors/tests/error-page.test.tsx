import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/errors';
import { ErrorPage } from '@/components/errors/error-page';

function renderFailedRoute(error: Error) {
  const root = createRootRoute({
    component: Outlet,
    errorComponent: ErrorPage,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <h1>Projects</h1>,
  });
  const failed = createRoute({
    getParentRoute: () => root,
    path: '/broken',
    loader: () => {
      throw error;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([home, failed]),
    history: createMemoryHistory({ initialEntries: ['/broken'] }),
  });
  render(<RouterProvider router={router} />);
}

describe('route error recovery', () => {
  it('explains a missing project as a 404 and lets the user return home', async () => {
    const user = userEvent.setup();
    renderFailedRoute(new ApiError(404, 'Project not found'));

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Page not found' }),
    );
    await user.click(screen.getByRole('link', { name: 'Go home' }));
    expect(
      await screen.findByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument();
  });

  it('keeps unexpected failures recoverable in a main landmark', async () => {
    const user = userEvent.setup();
    renderFailedRoute(new ApiError(500, 'Unexpected backend failure'));

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go home' }));
    expect(
      await screen.findByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument();
  });
});
