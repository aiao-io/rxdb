import { describe, expect, it } from 'vitest';
import { toPlainObject } from '../../object/toPlainObject.js';

describe('toPlainObject', () => {
  it('1', () => {
    class Foo {
      c = 3;
      b: unknown;
      constructor() {
        this.b = 2;
      }
    }

    const actual = Object.assign({ a: 1 }, toPlainObject(new Foo()));

    expect(actual).toEqual({ a: 1, b: 2, c: 3 });
  });
});
