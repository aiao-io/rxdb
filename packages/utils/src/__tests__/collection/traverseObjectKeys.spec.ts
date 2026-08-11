import { describe, expect, it } from 'vitest';
import { traverseObjectKeys } from '../../collection/traverseObjectKeys.js';

describe('traverseObjectKeys', () => {
  it('1', () => {
    const keys: string[] = [];
    return new Promise<void>(resolve => {
      traverseObjectKeys({ a: 1, b: [1, 2, { c: 1 }] }, key => {
        keys.push(key);
        if (keys.join('') === 'abc') {
          resolve();
        }
      });
    });
  });

  it('should stop recursing on circular references', () => {
    const source: { a: number; self?: unknown } = { a: 1 };
    source.self = source;
    const keys: string[] = [];

    expect(() => {
      traverseObjectKeys(source, key => {
        keys.push(key);
      });
    }).not.toThrow();

    expect(keys).toContain('a');
    expect(keys).toContain('self');
  });
});
