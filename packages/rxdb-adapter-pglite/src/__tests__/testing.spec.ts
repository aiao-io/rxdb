import { describe, expect, it } from 'vitest';

import { cleanup_db, cloneEntityClasses, generateDbName } from '../testing.js';

describe('testing subpath exports', () => {
  it('exports generateDbName as a function returning a unique string', () => {
    expect(typeof generateDbName).toBe('function');
    const a = generateDbName();
    const b = generateDbName();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('exports cleanup_db as an async function', () => {
    expect(typeof cleanup_db).toBe('function');
    expect(cleanup_db.constructor.name).toBe('AsyncFunction');
  });

  it('exports cloneEntityClasses preserving array length and producing fresh classes', () => {
    class A {}
    class B {}
    const clones = cloneEntityClasses([A, B] as unknown as Parameters<typeof cloneEntityClasses>[0]);
    expect(clones).toHaveLength(2);
    expect(clones[0]).not.toBe(A);
    expect(clones[1]).not.toBe(B);
    expect(Object.getPrototypeOf(clones[0])).toBe(A);
    expect(Object.getPrototypeOf(clones[1])).toBe(B);
  });

  it('cloneEntityClasses returns empty array for empty input', () => {
    expect(cloneEntityClasses([])).toEqual([]);
  });
});
