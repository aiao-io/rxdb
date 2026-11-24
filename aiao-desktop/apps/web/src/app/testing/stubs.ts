import { WritableSignal, signal } from '@angular/core';
import { Mock, vi } from 'vitest';

import { DesktopAppId } from '../services/desktop-apps';
import { MenuEntry } from '../services/menu';

/** {@link createWindowManagerStub} 的形状：窗口列表加其他服务会调用的方法，全是 spy。 */
export interface WindowManagerStub {
  readonly windows: WritableSignal<never[]>;
  readonly recentApps: WritableSignal<readonly DesktopAppId[]>;
  readonly open: Mock;
  readonly activate: Mock;
  readonly focus: Mock;
  readonly unminimize: Mock;
  readonly minimizeFront: Mock;
  readonly hideFront: Mock;
  readonly zoomFront: Mock;
  readonly quitFront: Mock;
  readonly closeFront: Mock;
  readonly closeAll: Mock<() => boolean | Promise<boolean>>;
  readonly hideOthers: Mock;
  readonly showAll: Mock;
  readonly unhideApp: Mock;
  readonly cycle: Mock;
  readonly byApp: Mock<() => unknown[]>;
  /** 前台窗口；替身默认返回 `null`。 */
  readonly front: Mock<() => unknown>;
  /** Window 菜单里前台应用的窗口条目；替身默认返回空数组。 */
  readonly windowMenuEntries: Mock<() => MenuEntry[]>;
  readonly showAppWindows: Mock<(appId: DesktopAppId) => void>;
}

/**
 * 窗口管理器的替身：只含其他服务会调用的方法，全是 spy。
 * 窗口管理器自己的行为在 `window-manager.spec.ts` 里测，这里让依赖它的服务单独验证"调了什么"。
 */
export function createWindowManagerStub(): WindowManagerStub {
  return {
    windows: signal([]),
    recentApps: signal([]),
    open: vi.fn(),
    activate: vi.fn(),
    focus: vi.fn(),
    unminimize: vi.fn(),
    minimizeFront: vi.fn(),
    hideFront: vi.fn(),
    zoomFront: vi.fn(),
    quitFront: vi.fn(),
    closeFront: vi.fn(),
    closeAll: vi.fn(() => true),
    hideOthers: vi.fn(),
    showAll: vi.fn(),
    unhideApp: vi.fn(),
    cycle: vi.fn(),
    byApp: vi.fn((): unknown[] => []),
    front: vi.fn(() => null),
    windowMenuEntries: vi.fn((): MenuEntry[] => []),
    showAppWindows: vi.fn()
  };
}
