import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, apiKeys } from '@/api';
import type { ProjectStatus } from '@/api';
import { ProjectList } from '@/features/projects/components/project-list';
import { renderWithQuery } from '@/tests/utils/render-with-query';

beforeEach(() => {
  window.localStorage.clear();
});

async function renderList(status?: ProjectStatus) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ProjectList status={status} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const projects = await api.listProjects(status);
  renderWithQuery(<RouterProvider router={router} />, [
    [apiKeys.projectList(status), projects],
  ]);
}

async function createDraft(name: string) {
  return api.createProject({
    name,
    requested_start_at: '2026-12-01T08:00:00+03:00',
    full_quantity: 5,
    half_quantity: 0,
    mix_id: null,
  });
}

describe('ProjectList', () => {
  it('FR27: lists projects with status and filters by status', async () => {
    await createDraft('Boundary wall');
    const second = await createDraft('Workshop');
    await api.cancelProject(second.project.id, {
      project_version: second.project.version,
      reason: 'Not needed',
    });

    await renderList('cancelled');
    expect(await screen.findAllByText('Workshop')).not.toHaveLength(0);
    expect(screen.queryByText('Boundary wall')).not.toBeInTheDocument();
  });

  it('explains an empty list and offers the next step', async () => {
    await renderList();
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'New project' }),
    ).toBeInTheDocument();
  });
});
