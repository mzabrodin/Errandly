import type { Request, Response } from 'express';

import { originCheck } from './origin-check.js';

function run(method: string, origin?: string) {
  const check = originCheck('http://localhost:5173/');
  const request = { method, headers: origin === undefined ? {} : { origin } } as Request;
  const json = vi.fn<(body: unknown) => void>();
  const status = vi.fn<(code: number) => { json: typeof json }>(() => ({ json }));
  const next = vi.fn<() => void>();
  check(request, { status } as unknown as Response, next);
  return { next, status, json };
}

describe('originCheck', () => {
  it('lets same-origin and origin-less requests through', () => {
    expect(run('POST', 'http://localhost:5173').next).toHaveBeenCalled();
    expect(run('DELETE').next).toHaveBeenCalled();
  });

  it('never blocks safe methods', () => {
    expect(run('GET', 'https://evil.example').next).toHaveBeenCalled();
  });

  it('refuses a cross-site state-changing request with 403 FORBIDDEN', () => {
    const { next, status, json } = run('POST', 'https://evil.example');

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ code: 'FORBIDDEN' });
  });
});
