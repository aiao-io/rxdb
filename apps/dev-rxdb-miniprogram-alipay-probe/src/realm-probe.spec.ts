import { readProbedRuntimeGlobal, readRealmProbe } from './realm-probe.js';

describe('realm-probe', () => {
  it('没有构建 banner（源码级运行）时记录为 null、真实全局对象为 undefined', () => {
    expect(readRealmProbe()).toBeNull();
    expect(readProbedRuntimeGlobal()).toBeUndefined();
  });
});
