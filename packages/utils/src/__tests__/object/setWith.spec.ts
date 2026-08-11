import { describe, expect, it } from 'vitest';
import { setWith } from '../../object/setWith.js';

describe('setWith', () => {
  it('1', () => {
    expect(setWith({ '0': { length: 2 } }, '[0][1][2]', 3, Object)).toEqual({ '0': { '1': { '2': 3 }, length: 2 } });
    expect(setWith({ '0': { length: 2 } }, '[0][1][2].c', { a: 1 }, Object)).toEqual({
      '0': { '1': { '2': { c: { a: 1 } } }, length: 2 }
    });
  });
});
