import { describe, expect, it } from 'vitest';
import { omit } from '../../object/omit.js';

describe('omit', () => {
  it('1', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ b: 2 });
  });
  it('2', () => {
    expect(omit(null as unknown as { a: unknown }, ['a'])).toEqual({});
  });
  it('2', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, [])).toEqual({ a: 1, b: 2, c: 3 });
  });
});
