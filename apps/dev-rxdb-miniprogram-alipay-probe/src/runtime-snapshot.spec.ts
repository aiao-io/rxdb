import { installedGlobals, readRepairableGlobals } from './runtime-snapshot.js';

describe('readRepairableGlobals', () => {
  it('记下正式 host 可能补的两个全局的 typeof', () => {
    expect(readRepairableGlobals({ BigInt, queueMicrotask: undefined } as never)).toEqual({
      BigInt: 'function',
      queueMicrotask: 'undefined'
    });
  });
});

describe('installedGlobals', () => {
  it('只列引导前不是函数、引导后是函数的全局，按固定顺序', () => {
    const missing = { BigInt: 'undefined', queueMicrotask: 'undefined' };
    const present = { BigInt: 'function', queueMicrotask: 'function' };

    expect(installedGlobals(missing, present)).toEqual(['BigInt', 'queueMicrotask']);
    expect(installedGlobals({ ...present, queueMicrotask: 'undefined' }, present)).toEqual(['queueMicrotask']);
    expect(installedGlobals(present, present)).toEqual([]);
    expect(installedGlobals(missing, missing)).toEqual([]);
  });
});
