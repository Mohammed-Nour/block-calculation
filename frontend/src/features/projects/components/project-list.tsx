import { Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

import { projectListQueryOptions } from '@/api';
import type { ProjectListItem, ProjectStatus } from '@/api';
import { StatusBadge } from '@/components/common';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatCount, formatDateTime, formatMoney } from '@/lib';

function ProjectLink({ project }: { project: ProjectListItem }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: String(project.id) }}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      {project.name}
    </Link>
  );
}

function mixLabel(project: ProjectListItem) {
  return project.mix_id === null ? 'No mix' : `Mix ${project.mix_id}`;
}

/** FR27: projects with mix, quantities, saved cost, status and ready time. */
export function ProjectList({ status }: { status?: ProjectStatus }) {
  const { data: projects } = useSuspenseQuery(projectListQueryOptions(status));

  if (projects.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="font-medium">
          No projects {status ? 'with this status' : 'yet'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {status
            ? 'Choose another status above.'
            : 'Create a project to estimate its cost.'}
        </p>
        <Link
          to="/projects/new"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          New project
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:hidden">
        {projects.map((project) => (
          <li key={project.id} className="bl-panel grid gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <ProjectLink project={project} />
              <StatusBadge status={project.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Order</dt>
              <dd>
                {formatCount(project.full_quantity)} full ·{' '}
                {formatCount(project.half_quantity)} half
              </dd>
              <dt className="text-muted-foreground">Mix</dt>
              <dd>{mixLabel(project)}</dd>
              <dt className="text-muted-foreground">Cost</dt>
              <dd>
                {formatMoney(project.latest_total_cost, project.currency)}
              </dd>
              <dt className="text-muted-foreground">Ready</dt>
              <dd>{formatDateTime(project.expected_ready_at)}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="bl-panel hidden sm:block">
        <Table>
          <TableCaption className="sr-only">Projects</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Project</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Mix</TableHead>
              <TableHead scope="col" className="text-right">
                Full · half
              </TableHead>
              <TableHead scope="col" className="text-right">
                Saved cost
              </TableHead>
              <TableHead scope="col">Expected ready</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <ProjectLink project={project} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={project.status} />
                </TableCell>
                <TableCell>{mixLabel(project)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(project.full_quantity)} ·{' '}
                  {formatCount(project.half_quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(project.latest_total_cost, project.currency)}
                </TableCell>
                <TableCell>
                  {formatDateTime(project.expected_ready_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
