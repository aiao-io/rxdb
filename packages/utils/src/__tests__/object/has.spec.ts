import { describe, expect, it } from 'vitest';
import { has } from '../../object/has.js';

describe('has', () => {
  it('1', () => {
    expect(has({ a: { b: { c: 1 } } }, 'a.b.c')).toBeTruthy();
  });
});

it('does not traverse inherited properties', () => {
  const inherited = { nested: { value: 1 } };
  const object = Object.create(inherited) as Record<string, unknown>;
  expect(has(object, 'nested.value')).toBe(false);
});
