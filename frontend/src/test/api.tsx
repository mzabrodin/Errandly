import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

export interface ApiCall {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

interface ApiAnswer {
  status?: number;
  body?: unknown;
}

async function callOf(input: RequestInfo | URL, init?: RequestInit): Promise<ApiCall> {
  // The avatar upload calls fetch with jsdom's FormData, which Node's Request cannot take
  if (!(input instanceof Request)) {
    const url = new URL(String(input));
    const body = init?.body instanceof FormData ? [...init.body.keys()] : init?.body;
    return { method: init?.method ?? 'GET', path: url.pathname, search: url.search, body };
  }
  const url = new URL(input.url);
  const text = await input.text();
  return {
    method: input.method,
    path: url.pathname,
    search: url.search,
    body: text === '' ? undefined : JSON.parse(text),
  };
}

export function stubApi(answer: (call: ApiCall) => ApiAnswer = () => ({})): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = await callOf(input, init);
    calls.push(call);
    const { status = 200, body = {} } = answer(call);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return calls;
}

export function renderApiHook<T>(hook: () => T) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(hook, { wrapper });
  const invalidated = (): (QueryKey | undefined)[] =>
    invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { result, queryClient, invalidated };
}
