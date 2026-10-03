import { repairRuntimeGlobal } from './runtime-repairs.js';

/** 只有 `Promise` 的全局对象：模拟器逻辑层同时缺 `BigInt` 与 `queueMicrotask`。 */
function bareGlobal(): typeof globalThis {
  return { Promise } as unknown as typeof globalThis;
}

describe('repairRuntimeGlobal', () => {
  it('两者都缺：从 wasm 的 i64 返回值取回 BigInt，用 Promise 补 queueMicrotask', async () => {
    const target = bareGlobal();
    const report = await repairRuntimeGlobal(target, WebAssembly);
    expect(report).toEqual({
      before: { BigInt: 'undefined', queueMicrotask: 'undefined' },
      installed: ['BigInt', 'queueMicrotask']
    });
    expect(target.BigInt).toBe(BigInt);
    expect(target.BigInt('9007199254740993') + target.BigInt(1)).toBe(9007199254740994n);
    expect(Object.keys(target)).toEqual(['Promise']);
  });

  it('补上的 queueMicrotask 在当前任务之后、下一个宏任务之前执行', async () => {
    const target = bareGlobal();
    await repairRuntimeGlobal(target, WebAssembly);
    const order: string[] = [];
    target.queueMicrotask(() => order.push('micro'));
    setTimeout(() => order.push('macro'), 0);
    order.push('sync');
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(order).toEqual(['sync', 'micro', 'macro']);
  });

  it('已有的不动：只补缺的那个', async () => {
    const ownMicrotask = vi.fn();
    const target = { Promise, BigInt, queueMicrotask: ownMicrotask } as unknown as typeof globalThis;
    const report = await repairRuntimeGlobal(target, undefined);
    expect(report).toEqual({ before: { BigInt: 'function', queueMicrotask: 'function' }, installed: [] });
    expect(target.queueMicrotask).toBe(ownMicrotask);
  });

  it('缺 BigInt 又没有 WebAssembly：如实抛错，不装任何东西', async () => {
    const target = bareGlobal();
    await expect(repairRuntimeGlobal(target, undefined)).rejects.toThrow('没有 WebAssembly');
    expect(target.queueMicrotask).toBeUndefined();
  });

  it('引擎没有 JS-BigInt 集成（i64 返回值不是 bigint）：抛错', async () => {
    const wasm = { instantiate: async () => ({ instance: { exports: { f: () => 7 } } }) };
    await expect(repairRuntimeGlobal(bareGlobal(), wasm)).rejects.toThrow('不是 bigint');
  });
});
