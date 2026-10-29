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

// `result[key] = value` 遇到 `__proto__` 键会走继承来的原型 setter：
// 数据键没有成为自有属性，结果的原型被换成调用方数据，还凭空多出一批继承属性。
describe('`__proto__` 数据键写成自有属性', () => {
  it('JSON 自有的 `__proto__` 键原样保留，结果原型不变', () => {
    const source = JSON.parse('{"__proto__":{"unexpected":true},"safe":1}') as Record<string, unknown>;
    const protoValue: unknown = Object.getOwnPropertyDescriptor(source, '__proto__')?.value;

    const result = toPlainObject(source);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result)).toEqual(['__proto__', 'safe']);
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')).toEqual({
      value: protoValue,
      writable: true,
      enumerable: true,
      configurable: true
    });
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe(protoValue);
    expect(result['safe']).toBe(1);
    expect('unexpected' in result).toBe(false);
    expect('unexpected' in {}).toBe(false);
  });
});
