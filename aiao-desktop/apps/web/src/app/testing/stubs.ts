import { WritableSignal, signal } from '@angular/core';
import { Mock, vi } from 'vitest';

/** {@link createWindowManagerStub} 的形状：窗口列表加其他服务会调用的方法，全是 spy。 */
export interface WindowManagerStub {
  readonly windows: WritableSignal<never[]>;
  readonly open: Mock;
  readonly focus: Mock;
  readonly unminimize: Mock;
  readonly minimizeFront: Mock;
  readonly zoomFront: Mock;
  readonly quitFront: Mock;
  readonly closeFront: Mock;
  readonly closeAll: Mock;
  readonly hideOthers: Mock;
  readonly showAll: Mock;
  readonly cycle: Mock;
  readonly byApp: Mock<() => unknown[]>;
}

/**
 * 窗口管理器的替身：只含其他服务会调用的方法，全是 spy。
 * 窗口管理器自己的行为在 `window-manager.spec.ts` 里测，这里让依赖它的服务单独验证"调了什么"。
 */
export function createWindowManagerStub(): WindowManagerStub {
  return {
    windows: signal([]),
    open: vi.fn(),
    focus: vi.fn(),
    unminimize: vi.fn(),
    minimizeFront: vi.fn(),
    zoomFront: vi.fn(),
    quitFront: vi.fn(),
    closeFront: vi.fn(),
    closeAll: vi.fn(),
    hideOthers: vi.fn(),
    showAll: vi.fn(),
    cycle: vi.fn(),
    byApp: vi.fn((): unknown[] => [])
  };
}
