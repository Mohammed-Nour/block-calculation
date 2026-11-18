import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // TanStack Router control flow: `redirect` is thrown by design.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: '/projects', replace: true });
  },
});
