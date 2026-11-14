// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachHostWindow, type WorkbenchHostWindow, type WorkbenchHostWindowState } from './host-window.js';
import { createWorkbenchLayout } from './workbench-layout.js';

afterEach(() => document.body.replaceChildren());

function hostWindow(state: WorkbenchHostWindowState = { focused: true, maximized: false }) {
  const listeners = new Set<(next: WorkbenchHostWindowState) => void>();
  const window: WorkbenchHostWindow & { emit(next: WorkbenchHostWindowState): void } = {
    state,
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    onStateChange(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    emit(next) {
      for (const listener of listeners) listener(next);
    }
  };
  return { window, listeners };
}

function layout() {
  const host = document.createElement('div');
  document.body.append(host);
  return createWorkbenchLayout(host, 'http://localhost/browser-workbench-assets/');
}

describe('宿主窗口（Aiao Desktop 的透明窗口，US-411）', () => {
  it('标题栏左侧装上红黄绿按钮，标题栏本身是拖动区，显示模式切到 desktop-window', () => {
    const root = layout();
    const { window } = hostWindow();
    attachHostWindow(root, window);
    const title = root.querySelector('.wb-title')!;
    expect(root.dataset['displayMode']).toBe('desktop-window');
    expect(title.hasAttribute('data-orbit-drag-region')).toBe(true);
    expect(title.firstElementChild?.classList.contains('wb-window-controls')).toBe(true);
    expect(
      [...title.querySelectorAll('.wb-window-controls button')].map(button => button.getAttribute('aria-label'))
    ).toEqual(['关闭', '最小化', '缩放']);
  });

  it('按钮调用宿主的关闭、最小化与缩放', () => {
    const root = layout();
    const { window } = hostWindow();
    attachHostWindow(root, window);
    const click = (action: string) =>
      root.querySelector<HTMLButtonElement>(`.wb-window-controls [data-window-action="${action}"]`)!.click();
    click('minimize');
    click('maximize');
    click('close');
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.toggleMaximize).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
  });

  it('窗口失去前台、缩放时跟着宿主推送的状态变化', () => {
    const root = layout();
    const { window } = hostWindow();
    attachHostWindow(root, window);
    expect(root.dataset['windowFocused']).toBe('true');
    expect(root.dataset['windowMaximized']).toBe('false');
    window.emit({ focused: false, maximized: true });
    expect(root.dataset['windowFocused']).toBe('false');
    expect(root.dataset['windowMaximized']).toBe('true');
  });

  it('卸载后移除按钮与拖动区，不再跟随状态', () => {
    const root = layout();
    const { window, listeners } = hostWindow();
    const detach = attachHostWindow(root, window);
    detach();
    expect(root.querySelector('.wb-window-controls')).toBeNull();
    expect(root.querySelector('.wb-title')!.hasAttribute('data-orbit-drag-region')).toBe(false);
    expect(listeners.size).toBe(0);
  });
});
