import { api, ApiError, unwrap } from './client';

describe('unwrap', () => {
  it('returns data of a successful response', async () => {
    const request = Promise.resolve({ data: { status: 'ok' }, response: new Response() });

    await expect(unwrap(request)).resolves.toEqual({ status: 'ok' });
  });

  it('throws ApiError with status and body of an error response', async () => {
    const body = { message: 'Немає доступу' };
    const request = Promise.resolve({ error: body, response: new Response(null, { status: 403 }) });

    await expect(unwrap(request)).rejects.toEqual(new ApiError(403, body));
    await expect(unwrap(request)).rejects.toMatchObject({ status: 403, body });
  });

  it('throws ApiError for an error response without a body', async () => {
    const request = Promise.resolve({
      error: undefined,
      response: new Response(null, { status: 401 }),
    });

    await expect(unwrap(request)).rejects.toMatchObject({ status: 401, body: undefined });
  });

  it('infers response types from the OpenAPI schema', () => {
    expectTypeOf(() => unwrap(api.GET('/api/health'))).returns.resolves.toEqualTypeOf<{
      status: 'ok';
    }>();
  });
});
