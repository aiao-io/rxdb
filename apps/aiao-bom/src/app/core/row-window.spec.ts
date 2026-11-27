import { describe, expect, it } from 'vitest';
import { RowWindows } from './row-window';
describe('分段展示数据源', () => {
  it('末行可直接读取，只物化所需窗口并淘汰旧窗口', () => {
    let calls = 0;
    const windows = new RowWindows(
      Array.from({ length: 100000 }, (_, i) => i),
      value => {
        calls++;
        return { value };
      },
      500,
      4
    );
    expect(windows.get(99999)).toEqual({ value: 99999 });
    expect(calls).toBe(500);
    const same = windows.get(99500);
    expect(windows.get(99500)).toBe(same);
    for (let i = 0; i < 10; i++) windows.get(i * 500);
    expect(windows.size).toBeLessThanOrEqual(2000);
    expect(windows.get(100000)).toBeUndefined();
  });
});
