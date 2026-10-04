import { GLOBAL_NAMES } from './experiments/environment.js';
import { captureFreeGlobals } from './free-globals.js';

describe('captureFreeGlobals', () => {
  it('覆盖 globalThis 侧读取的全部名字，两份结果可以逐项对照', () => {
    expect(Object.keys(captureFreeGlobals())).toEqual(
      expect.arrayContaining([...GLOBAL_NAMES, 'crypto.getRandomValues', 'globalThis'])
    );
  });

  it('读的是真实作用域链：Node 里 globalThis 是对象', () => {
    expect(captureFreeGlobals()).toMatchObject({ globalThis: 'object', TextDecoder: 'function', tt: 'undefined' });
  });
});
