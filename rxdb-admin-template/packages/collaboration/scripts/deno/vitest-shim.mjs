// 在 Deno 与 Supabase Edge Runtime 里运行协作包 vitest 用例的最小替身（`deno-identity.mjs` 打包时把 `vitest` 指到这里）：
// describe / it / it.each 只登记用例到 globalThis.__collaborationTests，由各运行时的驱动依次执行；
// expect 的匹配器只实现用例用到的那些，相等与子集比较交给 node:assert 的 deepStrictEqual（与 vitest 一样忽略值为 undefined 的属性）；
// vi.fn 记录调用参数。用例本身原样不改，替身只换掉测试框架。
import assert from 'node:assert';

const registry = (globalThis.__collaborationTests ??= []);
const prefixes = [];

export function describe(name, body) {
  prefixes.push(name);
  try {
    body();
  } finally {
    prefixes.pop();
  }
}
export function it(name, fn) {
  registry.push({ name: [...prefixes, name].join(' › '), fn });
}
const format = (template, values) => {
  let index = 0;
  return template.replace(/%[sdj]/g, () => String(values[index++]));
};
it.each = cases => (name, fn) => {
  for (const values of cases) it(format(name, values), () => fn(...values));
};
export const test = it;

/** 去掉值为 undefined 的属性后再比较（vitest 的 toEqual 也这样）。 */
function defined(value) {
  if (Array.isArray(value)) return value.map(defined);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, defined(item)])
  );
}
/** 子集比较：期望里出现的键必须相等（对象逐层，其余按 deepStrictEqual）。 */
function matches(actual, expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    assert.deepStrictEqual(defined(actual), defined(expected));
    return;
  }
  assert.ok(actual && typeof actual === 'object', `expected an object, received ${String(actual)}`);
  for (const [key, item] of Object.entries(expected)) matches(actual[key], item);
}
const calls = target => {
  assert.ok(Array.isArray(target?.mock?.calls), 'expected a vi.fn() mock');
  return target.mock.calls;
};
function matchers(actual, negate) {
  const check = (pass, message) => assert.ok(negate ? !pass : pass, negate ? `not: ${message}` : message);
  return {
    toBe: expected => check(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`),
    toEqual: expected => {
      if (negate) assert.notDeepStrictEqual(defined(actual), defined(expected));
      else assert.deepStrictEqual(defined(actual), defined(expected));
    },
    toMatchObject: expected => matches(actual, expected),
    toThrow: expected => {
      if (negate) assert.doesNotThrow(actual);
      else if (expected) assert.throws(actual, expected);
      else assert.throws(actual);
    },
    toHaveBeenCalled: () => check(calls(actual).length > 0, 'expected the mock to have been called'),
    toHaveBeenCalledTimes: times =>
      check(calls(actual).length === times, `expected ${times} calls, received ${calls(actual).length}`),
    toHaveBeenCalledWith: (...args) =>
      check(
        calls(actual).some(call => {
          try {
            assert.deepStrictEqual(defined(call), defined(args));
            return true;
          } catch {
            return false;
          }
        }),
        'expected the mock to have been called with the given arguments'
      )
  };
}
export function expect(actual) {
  return {
    ...matchers(actual, false),
    not: matchers(actual, true),
    resolves: {
      toEqual: async expected => assert.deepStrictEqual(defined(await actual), defined(expected)),
      toMatchObject: async expected => matches(await actual, expected),
      toBe: async expected => assert.strictEqual(await actual, expected)
    },
    rejects: {
      toThrow: async expected => {
        if (expected) await assert.rejects(actual, expected);
        else await assert.rejects(actual);
      }
    }
  };
}
export const vi = {
  fn(implementation = () => undefined) {
    const mock = { calls: [] };
    const spy = (...args) => {
      mock.calls.push(args);
      return implementation(...args);
    };
    spy.mock = mock;
    return spy;
  }
};
