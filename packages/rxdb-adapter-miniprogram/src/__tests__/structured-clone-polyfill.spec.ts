/**
 * US-211：抖音页面模块的包装函数把 `globalThis` 遮蔽成 `undefined`，也没有 `self`。
 * structuredClone polyfill 会被打进页面包，重建类型化数组、包装对象与 Error 时不能经
 * `self` / `globalThis` 找构造函数，否则在抖音上一克隆二进制就 TypeError。
 *
 * 这里把 polyfill 打成 IIFE，放进形参遮蔽了 `globalThis` / `self` / `global` 的函数里求值，
 * 复现页面包装函数的作用域。
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { structuredClonePolyfill } from '../structured-clone-polyfill.js';

type Clone = <T>(value: T) => T;

const ENTRY = fileURLToPath(new URL('../structured-clone-polyfill.ts', import.meta.url));

/** 在遮蔽了 `globalThis` / `self` / `global` 的作用域里求值打包产物，取出 polyfill。 */
async function loadInShadowedPageScope(): Promise<Clone> {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'polyfillModule',
    platform: 'neutral',
    write: false,
    logLevel: 'silent'
  });
  const source = `${result.outputFiles[0].text}\nreturn polyfillModule.structuredClonePolyfill;`;
  const evaluate = new Function('globalThis', 'self', 'global', source) as (...scope: unknown[]) => Clone;
  return evaluate(undefined, undefined, {});
}

/** 两种求值环境共用的断言：结果与原值相等、类型一致且不共享内存。 */
function expectFaithfulClones(clone: Clone): void {
  const bytes = Uint8Array.of(1, 2, 3);
  const copiedBytes = clone(bytes);
  expect(copiedBytes).toBeInstanceOf(Uint8Array);
  expect(Array.from(copiedBytes)).toEqual([1, 2, 3]);
  expect(copiedBytes.buffer).not.toBe(bytes.buffer);

  const words = clone(new BigInt64Array([1n, -2n]));
  expect(words).toBeInstanceOf(BigInt64Array);
  expect(Array.from(words)).toEqual([1n, -2n]);
  expect(clone(new Float64Array([0.5]))).toBeInstanceOf(Float64Array);

  const buffer = clone(Uint8Array.of(9, 8).buffer);
  expect(buffer).toBeInstanceOf(ArrayBuffer);
  expect(Array.from(new Uint8Array(buffer))).toEqual([9, 8]);
  const view = clone(new DataView(Uint8Array.of(7).buffer));
  expect(view).toBeInstanceOf(DataView);
  expect(view.getUint8(0)).toBe(7);

  const rangeError = clone(new RangeError('out of range'));
  expect(rangeError).toBeInstanceOf(RangeError);
  expect(rangeError.message).toBe('out of range');
  // 未知名字按 HTML 规范落成普通 Error，不按名字找全局构造函数
  const custom = clone(Object.assign(new Error('custom'), { name: 'QuotaError' }));
  expect(custom.constructor).toBe(Error);
  expect(custom.message).toBe('custom');

  const wrapped = clone(Object(7) as number);
  expect(typeof wrapped).toBe('object');
  expect(wrapped.valueOf()).toBe(7);
  expect(clone(Object('s') as string).valueOf()).toBe('s');
  expect(clone(Object(false) as boolean).valueOf()).toBe(false);
  expect(clone(Object(5n) as bigint).valueOf()).toBe(5n);

  const nested = { id: 1n, at: new Date(0), tags: new Set(['a']), meta: new Map([['k', [/x/g, undefined, -0]]]) };
  const copiedNested = clone(nested);
  expect(copiedNested).toEqual(nested);
  expect(Object.is(copiedNested.meta.get('k')?.[2], -0)).toBe(true);

  const shared = Uint8Array.of(4);
  const graph = clone({ left: shared, right: shared });
  expect(graph.left).toBe(graph.right);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  const copiedCycle = clone(cyclic);
  expect(copiedCycle.self).toBe(copiedCycle);
}

describe('structuredClonePolyfill', () => {
  it('在有 globalThis 的环境里克隆二进制、包装对象与 Error', () => {
    expectFaithfulClones(structuredClonePolyfill);
  });

  describe('页面包装函数遮蔽了 globalThis 与 self（抖音）', () => {
    let clone: Clone;
    beforeAll(async () => {
      clone = await loadInShadowedPageScope();
    });

    it('仍能克隆二进制、包装对象与 Error', () => {
      expectFaithfulClones(clone);
    });
  });

  it('函数与 symbol 拒绝克隆，不静默丢弃', () => {
    expect(() => structuredClonePolyfill({ run: () => undefined })).toThrow(TypeError);
    expect(() => structuredClonePolyfill(Symbol('s'))).toThrow(TypeError);
  });
});
