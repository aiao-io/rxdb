import { describe, expect, it } from 'vitest';
import { isEqual } from '../../object/isEqual.js';

describe('isEqual', () => {
  it('1', () => {
    expect(isEqual(-0, -0)).toEqual(true);
  });
  it('2', () => {
    expect(isEqual(-0, 0)).toEqual(true);
  });
  it('3', () => {
    expect(isEqual('a', 'a')).toEqual(true);
  });
  it('4', () => {
    expect(isEqual([], [])).toEqual(true);
  });
  it('5', () => {
    expect(isEqual([{ b: [1, 2, 3] }], [{ b: [1, 2, 3] }])).toEqual(true);
  });
  it('6', () => {
    expect(isEqual([{ b: 2, a: 1 }], [{ a: 1, b: 2 }])).toEqual(true);
  });
  it('7', () => {
    expect(isEqual([true, null, 1, 'a', undefined], [true, null, 1, 'a', undefined])).toEqual(true);
  });
  it('8', () => {
    expect(isEqual({}, {})).toEqual(true);
  });
  it('9', () => {
    expect(isEqual(0, 0)).toEqual(true);
  });
  it('10', () => {
    expect(isEqual(1, 1)).toEqual(true);
  });
  it('11', () => {
    expect(isEqual(false, false)).toEqual(true);
  });
  it('12', () => {
    const hello = Symbol('hello');
    expect(isEqual(hello, hello)).toEqual(true);
  });
  it('13', () => {
    function map(object: Record<string, unknown>) {
      const m = new Map<string, unknown>();
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          m.set(key, object[key]);
        }
      }
      return m;
    }
    expect(isEqual(map({ a: 1, b: '1' }), map({ b: '1', a: 1 }))).toEqual(true);
  });
  it('14', () => {
    expect(isEqual(NaN, NaN)).toEqual(true);
  });
  it('15', () => {
    expect(isEqual(new Map(), new Map())).toEqual(true);
  });
  it('16', () => {
    expect(isEqual(new RegExp(/a*s/), new RegExp(/a*s/))).toEqual(true);
  });
  it('17', () => {
    const now = new Date();
    expect(isEqual(now, now)).toEqual(true);
  });
  it('data 2', () => {
    const a = new Date('1999-01-01');
    const b = new Date('1999-01-01');
    expect(isEqual(a, b)).toEqual(true);
  });
  it('18', () => {
    expect(isEqual(null, null)).toEqual(true);
  });
  it('19', () => {
    expect(isEqual(Object('a'), Object('a'))).toEqual(true);
  });
  it('20', () => {
    expect(isEqual(Object(0), Object(0))).toEqual(true);
  });
  it('21', () => {
    expect(isEqual(Object(false), Object(false))).toEqual(true);
  });
  it('22', () => {
    const symbol1 = Symbol ? Symbol('a') : true;
    expect(isEqual(Object(symbol1), Object(symbol1))).toEqual(true);
  });
  it('23', () => {
    expect(isEqual(Object(true), Object(true))).toEqual(true);
  });
  it('24', () => {
    const symbol1 = Symbol ? Symbol('a') : true;
    expect(isEqual(symbol1, symbol1)).toEqual(true);
  });
  it('25', () => {
    expect(isEqual(true, true)).toEqual(true);
  });
  it('26', () => {
    expect(isEqual(undefined, undefined)).toEqual(true);
  });
  it('27', () => {
    expect(isEqual('a', 'b')).toEqual(false);
  });
  it('28', () => {
    expect(isEqual('a', ['a'])).toEqual(false);
  });
  it('29', () => {
    expect(isEqual([], [1])).toEqual(false);
  });
  it('30', () => {
    expect(isEqual({ a: 1 }, {})).toEqual(false);
  });
  it('31', () => {
    expect(isEqual(0, '0')).toEqual(false);
  });
  it('32', () => {
    expect(isEqual(0, null)).toEqual(false);
  });
  it('33', () => {
    expect(isEqual(1, '1')).toEqual(false);
  });
  it('34', () => {
    expect(isEqual(1, 2)).toEqual(false);
  });
  it('35', () => {
    const classA = class A {};
    const classB = class B {};
    expect(isEqual(classA, classB)).toEqual(false);
  });
  it('36', () => {
    expect(isEqual(false, '')).toEqual(false);
  });
  it('37', () => {
    expect(isEqual(false, 0)).toEqual(false);
  });
  it('38', () => {
    expect(isEqual(NaN, 'a')).toEqual(false);
  });
  it('39', () => {
    expect(isEqual(NaN, Infinity)).toEqual(false);
  });
  it('40', () => {
    const classA = class A {};
    const classB = class B {};
    expect(isEqual(new classA(), new classB())).toEqual(false);
  });
  it('41', () => {
    expect(isEqual(new RegExp(/^http:/), new RegExp(/https/))).toEqual(false);
  });
  it('42', () => {
    expect(isEqual(null, '')).toEqual(false);
  });
  it('43', () => {
    expect(isEqual(null, {})).toEqual(false);
  });
  it('44', () => {
    expect(isEqual(null, undefined)).toEqual(false);
  });
  it('45', () => {
    expect(isEqual(Symbol('hello'), Symbol('goodbye'))).toEqual(false);
  });
  it('46', () => {
    expect(isEqual(Symbol('hello'), Symbol('hello'))).toEqual(false);
  });
  it('47', () => {
    const symbol1 = Symbol ? Symbol('a') : true;
    const symbol2 = Symbol ? Symbol('b') : false;
    expect(isEqual(symbol1, symbol2)).toEqual(false);
  });
  it('48', () => {
    expect(isEqual(true, 'a')).toEqual(false);
  });
  it('49', () => {
    expect(isEqual(true, 1)).toEqual(false);
  });
  it('50', () => {
    expect(isEqual(undefined, '')).toEqual(false);
  });
  it('51', () => {
    expect(isEqual(undefined, null)).toEqual(false);
  });

  it('52', () => {
    const a = {
      items: [
        '019061ea-629b-7ddd-a8c9-29c6bf1de3f4@12',
        '019061ea-629a-7ddd-a8c8-d493d56f4541@0',
        '019061ea-629a-7ddd-a8c8-9bfb54995a60@123',
        '019061ea-6299-7ddd-a8c8-5441875eb6cc@0',
        '019061ea-6299-7ddd-a8c8-0ab95b9c37e2@0',
        '019061ea-6298-7ddd-a8c7-b70bb7fa3271@0',
        '019061ea-6297-7ddd-a8c7-5ac43facc08c@0',
        '019061ea-6297-7ddd-a8c7-06dd7aafb469@0',
        '019061ea-6297-7ddd-a8c6-ffcf42269561@1',
        '019061ea-6297-7ddd-a8c6-f08fdb7df04c@2'
      ],
      totalCount: 14,
      hasPrevPage: false,
      hasNextPage: true,
      definition: [['id', 'desc']]
    };
    const b = {
      items: [
        '019061ea-629b-7ddd-a8c9-29c6bf1de3f4@345',
        '019061ea-629a-7ddd-a8c8-d493d56f4541@0',
        '019061ea-629a-7ddd-a8c8-9bfb54995a60@123',
        '019061ea-6299-7ddd-a8c8-5441875eb6cc@0',
        '019061ea-6299-7ddd-a8c8-0ab95b9c37e2@0',
        '019061ea-6298-7ddd-a8c7-b70bb7fa3271@0',
        '019061ea-6297-7ddd-a8c7-5ac43facc08c@0',
        '019061ea-6297-7ddd-a8c7-06dd7aafb469@0',
        '019061ea-6297-7ddd-a8c6-ffcf42269561@1',
        '019061ea-6297-7ddd-a8c6-f08fdb7df04c@2'
      ],
      totalCount: 14,
      hasPrevPage: false,
      hasNextPage: true,
      definition: [['id', 'desc']]
    };
    expect(isEqual(a, b)).toBe(false);
  });
  it('Uint8Array is equal', () => {
    expect(isEqual(new Uint8Array([42, 0]), new Uint8Array([42, 0]))).toBe(true);
  });

  it('maps with different content are not equal', () => {
    expect(isEqual(new Map([['a', 1]]), new Map([['b', 2]]))).toBe(false);
  });

  it('maps with same content different insertion order are equal', () => {
    expect(
      isEqual(
        new Map([
          ['a', 1],
          ['b', 2]
        ]),
        new Map([
          ['b', 2],
          ['a', 1]
        ])
      )
    ).toBe(true);
  });

  it('sets with different content are not equal', () => {
    expect(isEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
  });

  it('sets with same content are equal', () => {
    expect(isEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
  });

  it('circular objects compare without stack overflow', () => {
    const a: Record<string, unknown> = { x: 1 };
    const b: Record<string, unknown> = { x: 1 };
    a.self = a;
    b.self = b;
    expect(isEqual(a, b)).toBe(true);

    const c: Record<string, unknown> = { x: 2 };
    c.self = c;
    expect(isEqual(a, c)).toBe(false);
  });

  it('循环检测不得跨分支复用：Set 的试探性比较失败后不能被记成相等', () => {
    // Set 分支用 findIndex 逐个试探候选项，失败的 pair 若留在「已访问」表里，
    // 后续同 pair 比较会被短路成 true —— 两个内容完全不同的 Set 会被判为相等。
    const left = { k: 1 };
    const right = { k: 2 };

    expect(isEqual(new Set([{ x: left }, { x: left }]), new Set([{ x: right }, { x: right }]))).toBe(false);
  });

  it('只覆盖 toString 的内置对象按内容比较，而不是万物相等', () => {
    // URL / Error 没有自有可枚举属性，落到键比较会让任意两个实例都相等。
    expect(isEqual(new URL('http://a.com/'), new URL('http://b.com/'))).toBe(false);
    expect(isEqual(new URL('http://a.com/'), new URL('http://a.com/'))).toBe(true);
    expect(isEqual(new Error('a'), new Error('b'))).toBe(false);
    expect(isEqual(new Error('a'), new Error('a'))).toBe(true);
  });

  it('null 原型对象按自有键比较，不得抛 TypeError', () => {
    // null 原型对象匹配不上任何内置分支，会落到装箱原语判定；
    // 若该判定直接读 `a.valueOf`，原型链上没有 valueOf 就抛 TypeError。
    expect(isEqual(Object.create(null), Object.create(null))).toBe(true);

    const left = Object.assign(Object.create(null), { x: 1 });
    const right = Object.assign(Object.create(null), { x: 1 });
    expect(isEqual(left, right)).toBe(true);
    expect(isEqual(left, Object.assign(Object.create(null), { x: 2 }))).toBe(false);
  });

  it('嵌套的 null 原型对象同样安全', () => {
    expect(isEqual({ meta: Object.create(null) }, { meta: Object.create(null) })).toBe(true);
  });

  it('装箱原语仍按值比较', () => {
    expect(isEqual(new String('a'), new String('a'))).toBe(true);
    expect(isEqual(new String('a'), new String('b'))).toBe(false);
    expect(isEqual(new Number(1), new Number(1))).toBe(true);
    expect(isEqual(new Number(1), new Number(2))).toBe(false);
    expect(isEqual(new Boolean(true), new Boolean(true))).toBe(true);
    expect(isEqual(new Boolean(true), new Boolean(false))).toBe(false);
  });
});

// UTL-025：ArrayBuffer / DataView / 非 Uint8Array 的 TypedArray 都没有自有可枚举属性，
// 会落到通用对象分支被判「两侧键集都为空 → 恒等」，内容完全不参与比较。
describe('UTL-025 二进制容器必须比较内容', () => {
  const buf = (bytes: number[]) => new Uint8Array(bytes).buffer;

  it('ArrayBuffer 按内容比较', () => {
    expect(isEqual(buf([1, 2, 3]), buf([1, 2, 3]))).toBe(true);
    expect(isEqual(buf([1, 2, 3]), buf([1, 2, 4]))).toBe(false);
    expect(isEqual(buf([1, 2]), buf([1, 2, 3]))).toBe(false);
  });

  it('DataView 按内容比较', () => {
    expect(isEqual(new DataView(buf([1, 2])), new DataView(buf([1, 2])))).toBe(true);
    expect(isEqual(new DataView(buf([1, 2])), new DataView(buf([1, 9])))).toBe(false);
  });

  it('其他 TypedArray 按内容比较，且类型不同即不等', () => {
    expect(isEqual(new Int16Array([1, 2]), new Int16Array([1, 2]))).toBe(true);
    expect(isEqual(new Int16Array([1, 2]), new Int16Array([1, 3]))).toBe(false);
    expect(isEqual(new Int16Array([1, 2]), new Uint16Array([1, 2]))).toBe(false);
  });
});

// UTL-022：Object.keys 不含 symbol 键，symbol 键指向的整棵子树完全不参与比较，
// 只有 symbol 键不同的两个对象会被判相等。
describe('UTL-022 symbol 键参与深比较', () => {
  it('只有 symbol 键的值不同即不等', () => {
    const key = Symbol('tag');
    expect(isEqual({ [key]: 1 }, { [key]: 1 })).toBe(true);
    expect(isEqual({ [key]: 1 }, { [key]: 2 })).toBe(false);
  });

  it('symbol 键指向的子树深比较', () => {
    const key = Symbol('tag');
    expect(isEqual({ [key]: { a: [1, 2] } }, { [key]: { a: [1, 2] } })).toBe(true);
    expect(isEqual({ [key]: { a: [1, 2] } }, { [key]: { a: [1, 3] } })).toBe(false);
  });

  it('一侧多一个 symbol 键即不等', () => {
    const key = Symbol('tag');
    expect(isEqual({ a: 1, [key]: 1 }, { a: 1 })).toBe(false);
    expect(isEqual({ a: 1 }, { a: 1, [key]: 1 })).toBe(false);
  });

  it('键数量相同但 symbol 键不同即不等', () => {
    expect(isEqual({ [Symbol('x')]: 1 }, { [Symbol('y')]: 1 })).toBe(false);
  });

  it('同一个 symbol 键在两侧配对，不受字符串键数量掩盖', () => {
    const key = Symbol('tag');
    expect(isEqual({ a: 1, [key]: 'x' }, { a: 1, [key]: 'x' })).toBe(true);
    expect(isEqual({ a: 1, [key]: 'x' }, { a: 1, [key]: 'y' })).toBe(false);
  });

  it('不可枚举的 symbol 键不参与比较，与字符串键规则一致', () => {
    const key = Symbol('hidden');
    const a = { visible: 1 };
    const b = { visible: 1 };
    Object.defineProperty(a, key, { value: 1, enumerable: false });
    Object.defineProperty(b, key, { value: 2, enumerable: false });

    expect(isEqual(a, b)).toBe(true);
  });

  it('循环引用经由 symbol 键也能收敛', () => {
    const key = Symbol('self');
    const a: Record<symbol, unknown> = {};
    const b: Record<symbol, unknown> = {};
    a[key] = a;
    b[key] = b;

    expect(isEqual(a, b)).toBe(true);
  });
});
