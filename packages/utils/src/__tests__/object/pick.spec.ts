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

// `acc[key] = obj[key]` 遇到自有 `__proto__` 键（如 JSON.parse 的结果）会走原型 setter。
describe('自有 `__proto__` 键写成自有属性', () => {
  it('不改结果原型，值作为自有属性保留', () => {
    const source = JSON.parse('{"__proto__":{"polluted":true},"a":2}') as Record<string, unknown>;
    const picked = pick(source, ['__proto__', 'a']);

    expect(Object.getPrototypeOf(picked)).toBe(Object.prototype);
    expect(Object.keys(picked)).toEqual(['__proto__', 'a']);
    expect(Object.getOwnPropertyDescriptor(picked, '__proto__')?.value).toEqual({ polluted: true });
    expect((picked as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
