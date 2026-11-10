import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, type Ref } from 'vue';
import { useShowHistory } from './useShowHistory';

/**
 * @fileoverview 历史侧栏的断点监听跟着使用它的页面走（与 React 的 effect 清理、Angular 的 DestroyRef 同口径）：
 * Todo / 菜单 / 文件页每次进入都会调用，卸载不摘掉监听就会随导航累积、继续改已卸载页面的状态。
 */

/** 可控的 `(min-width: 768px)` 媒体查询：记下监听，测试里手动派发断点跨越。 */
function stubBreakpoint() {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: true,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  return {
    listeners,
    cross(wide: boolean) {
      media.matches = wide;
      for (const listener of [...listeners]) listener({ matches: wide } as MediaQueryListEvent);
    }
  };
}

function createPage(states: Ref<boolean>[]) {
  return defineComponent({
    setup() {
      states.push(useShowHistory().showHistory);
      return () => null;
    }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useShowHistory', () => {
  it('挂着时断点跨越同步侧栏开合', () => {
    const breakpoint = stubBreakpoint();
    const states: Ref<boolean>[] = [];
    const wrapper = mount(createPage(states));

    breakpoint.cross(false);
    expect(states[0]?.value).toBe(false);
    breakpoint.cross(true);
    expect(states[0]?.value).toBe(true);

    wrapper.unmount();
  });

  it('反复进入离开页面不累积监听，卸载后的页面状态不再被改', () => {
    const breakpoint = stubBreakpoint();
    const states: Ref<boolean>[] = [];
    const Page = createPage(states);

    for (let visit = 0; visit < 3; visit++) mount(Page).unmount();

    expect(breakpoint.listeners.size).toBe(0);
    const before = states.map(state => state.value);
    breakpoint.cross(!before[0]);
    expect(states.map(state => state.value)).toEqual(before);
  });
});
