import { describe, expect, it } from 'vitest';
import { parseDemoRequest } from './ipc-contract';

describe('parseDemoRequest', () => {
  it('accepts the named demo payload', () => {
    expect(parseDemoRequest({ data: 'hello' })).toEqual({ data: 'hello' });
  });

  it.each([null, {}, { data: '' }, { data: 1 }, { data: 'x'.repeat(1_001) }])('rejects %j', value => {
    expect(() => parseDemoRequest(value)).toThrow(TypeError);
  });
});
