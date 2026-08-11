import { describe, expect, it } from 'vitest';
import { queryParse } from '../../string/queryParse.js';

describe('queryParse', () => {
  it('ok', () => {
    const query = queryParse('a=2&a=1&c=2&d=foo');
    expect(query).toEqual({ a: ['2', '1'], c: '2', d: 'foo' });
  });
  it('ok', () => {
    const query = queryParse('a=1&a=2&a=3&c=2&d=foo');
    expect(query).toEqual({ a: ['1', '2', '3'], c: '2', d: 'foo' });
  });

  it('__proto__ 只作为普通键，不篡改返回对象的原型', () => {
    // `result[key]` 对 __proto__ 读到的是 Object.prototype（truthy 且非数组），
    // 于是走 else 分支把数组写进原型位。
    const query = queryParse('__proto__=1&a=2');

    expect(Object.getPrototypeOf(query)).not.toBe(Array.prototype);
    expect(Array.isArray(Object.getPrototypeOf(query))).toBe(false);
    expect(query['__proto__']).toBe('1');
    expect(query['a']).toBe('2');
    expect(Object.keys(query).sort()).toEqual(['__proto__', 'a']);
  });

  it('重复的 __proto__ 按普通键聚合为数组', () => {
    const query = queryParse('__proto__=1&__proto__=2');

    expect(query['__proto__']).toEqual(['1', '2']);
    expect(Array.isArray(Object.getPrototypeOf(query))).toBe(false);
  });

  it('constructor 键不被原型链上的同名属性干扰', () => {
    // `result['constructor']` 在普通对象上读到的是 Object 构造函数（truthy），
    // 会让首次出现的值被错误地当成「已存在」而聚合。
    expect(queryParse('constructor=1')['constructor']).toBe('1');
    expect(queryParse('constructor=1&constructor=2')['constructor']).toEqual(['1', '2']);
    expect(queryParse('toString=x')['toString']).toBe('x');
  });
});
