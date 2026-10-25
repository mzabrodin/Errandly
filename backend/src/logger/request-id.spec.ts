import { resolveRequestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a valid incoming id', () => {
    expect(resolveRequestId({ 'x-request-id': 'abc-123' })).toBe('abc-123');
  });

  it('generates an id when none is sent', () => {
    expect(resolveRequestId({})).toMatch(UUID);
  });

  it('replaces an id that could inject into logs', () => {
    expect(resolveRequestId({ 'x-request-id': 'bad\nid' })).toMatch(UUID);
    expect(resolveRequestId({ 'x-request-id': 'a'.repeat(129) })).toMatch(UUID);
  });
});
