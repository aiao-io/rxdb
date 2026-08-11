import { describe, expect, it } from 'vitest';
import { queryStringify } from '../../string/queryStringify.js';
describe('queryStringify', () => {
  it('ok', () => {
    const query = queryStringify({ a: [2, 1], c: 2, d: 3 });
    expect(query).toEqual('a=2&a=1&c=2&d=3');
  });
});
