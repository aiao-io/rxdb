import { Signal, WritableSignal, signal } from '@angular/core';
import { Mock, vi } from 'vitest';

import type { AppContextWindows } from '../services/app-context';
import type { DesktopWindow } from '../services/desktop-window';

/** {@link fakeWindows} 的形状：应用上下文会调用的窗口管理操作，全是 spy。 */
export interface FakeWindows extends AppContextWindows {
  readonly focused: Signal<DesktopWindow | null>;
  readonly open: Mock<AppContextWindows['open']>;
  readonly focus: Mock<AppContextWindows['focus']>;
  readonly minimize: Mock<AppContextWindows['minimize']>;
  readonly unminimize: Mock<AppContextWindows['unminimize']>;
  readonly zoom: Mock<AppContextWindows['zoom']>;
  readonly close: Mock<AppContextWindows['close']>;
  readonly quitApp: Mock<AppContextWindows['quitApp']>;
}

/**
 * 窗口管理的替身：只含应用上下文会调用的操作，全是 spy；前台窗口由测试用返回的 `focused` 信号控制。
 * `open` 只认 `calculator`（返回一个占位窗口），其余应用打不开（返回 null）。
 */
export function fakeWindows(): { windows: FakeWindows; focused: WritableSignal<DesktopWindow | null> } {
  const focused = signal<DesktopWindow | null>(null);
  const windows: FakeWindows = {
    focused: focused.asReadonly(),
    open: vi.fn<AppContextWindows['open']>(appId => (appId === 'calculator' ? ({} as DesktopWindow) : null)),
    focus: vi.fn(),
    minimize: vi.fn(),
    unminimize: vi.fn(),
    zoom: vi.fn(),
    close: vi.fn(),
    quitApp: vi.fn()
  };
  return { windows, focused };
}
