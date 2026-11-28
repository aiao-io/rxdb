import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppService } from './app.service';

/**
 * 视口宽度断点（768px）的替身；其余媒体查询（主题的 prefers-color-scheme）照常走浏览器实现。
 *
 * @returns 跨过断点的触发器
 */
function stubViewport(wide: boolean) {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const viewport = {
    matches: wide,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.push(listener)
    ),
    removeEventListener: vi.fn()
  } as unknown as MediaQueryList;
  const original = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation(query =>
    query === '(min-width: 768px)' ? viewport : original(query)
  );
  return {
    cross: (matches: boolean) => listeners.forEach(listener => listener({ matches } as MediaQueryListEvent))
  };
}

describe('AppService 侧栏', () => {
  afterEach(() => vi.restoreAllMocks());

  it('窄屏默认收起：展开就是盖住页面的抽屉', () => {
    stubViewport(false);

    expect(TestBed.inject(AppService).$sidebarPinned()).toBe(false);
  });

  it('宽屏默认展开', () => {
    stubViewport(true);

    expect(TestBed.inject(AppService).$sidebarPinned()).toBe(true);
  });

  it('跨过断点（旋转、缩放窗口）时跟着收起或展开', () => {
    const viewport = stubViewport(true);
    const app = TestBed.inject(AppService);

    viewport.cross(false);
    expect(app.$sidebarPinned()).toBe(false);

    viewport.cross(true);
    expect(app.$sidebarPinned()).toBe(true);
  });

  it('窄屏上选完菜单收起抽屉', () => {
    stubViewport(false);
    const app = TestBed.inject(AppService);
    app.toggleSidebar();

    app.closeOverlaySidebar();

    expect(app.$sidebarPinned()).toBe(false);
  });

  it('宽屏上侧栏不是浮层，选菜单不收起', () => {
    stubViewport(true);
    const app = TestBed.inject(AppService);

    app.closeOverlaySidebar();

    expect(app.$sidebarPinned()).toBe(true);
  });
});
