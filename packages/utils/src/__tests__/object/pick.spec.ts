import { describe, expect, it } from 'vitest';
import { pick } from '../../object/pick.js';

describe('pick', () => {
  it('1', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a'])).toEqual({ a: 1 });
  });
  it('2', () => {
    expect(pick(null as unknown as { a: unknown }, ['a'])).toEqual({});
  });
});
