import { readGlobalThisShim, shimApplied, type GlobalThisShimRecord } from './global-this-shim.js';

const untouched: GlobalThisShimRecord = { before: 'object', candidates: {}, chosen: null, applied: false };

describe('readGlobalThisShim', () => {
  it('没有构建 banner（源码级运行）时为 null', () => {
    expect(readGlobalThisShim()).toBeNull();
  });
});

describe('shimApplied', () => {
  it('任一包垫过即为真；缺记录的包不算', () => {
    expect(shimApplied({ page: null, core: null })).toBe(false);
    expect(shimApplied({ page: untouched, core: null })).toBe(false);
    const shimmed = { ...untouched, before: 'undefined', chosen: 'sloppyThis', applied: true };
    expect(shimApplied({ page: untouched, core: shimmed })).toBe(true);
  });
});
