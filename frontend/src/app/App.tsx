import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSX } from 'react';
import { RouterProvider } from 'react-router';

import { sessionKey } from '../shared/api/auth';
import { ApiError } from '../shared/api/client';
import { ToastProvider } from '../shared/ui/Toast';
import { LocaleSync } from './LocaleSync';
import { router } from './router';

function handleUnauthenticated(error: unknown) {
  // Session expired (NFR-SEC-03): send the user back to sign-in
  if (error instanceof ApiError && error.status === 401) {
    queryClient.setQueryData(sessionKey, null);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleUnauthenticated }),
  mutationCache: new MutationCache({ onError: handleUnauthenticated }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
  },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleSync />
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
