import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { getRouter } from './router';
import './styles.css';

const { router, queryClient } = getRouter();
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
