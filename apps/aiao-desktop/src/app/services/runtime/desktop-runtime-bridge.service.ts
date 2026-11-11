import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export interface DesktopRuntimeGlobals {
  readonly WM: unknown;
  readonly APPS: unknown;
  readonly Pop: unknown;
  readonly Dock: unknown;
  readonly MenuBar: unknown;
  readonly Theme: unknown;
  readonly SYS: unknown;
  readonly Wall: unknown;
  readonly Screen: unknown;
  readonly Desktop: unknown;
  readonly Launchpad: unknown;
  readonly Spotlight: unknown;
  readonly NotifCenter: unknown;
  readonly Startup: unknown;
}

type RuntimeWindow = Window & {
  __AIAO_DESKTOP_RUNTIME_LOADED__?: boolean;
  __aiaoRuntimeBridge?: {
    publish(globals: DesktopRuntimeGlobals): void;
  };
  WM?: unknown;
  APPS?: unknown;
  Pop?: unknown;
  Dock?: unknown;
  MenuBar?: unknown;
  Theme?: unknown;
  SYS?: unknown;
  Wall?: unknown;
  Screen?: unknown;
  Desktop?: unknown;
  Launchpad?: unknown;
  Spotlight?: unknown;
  NotifCenter?: unknown;
  Startup?: unknown;
};

/** 集中管理旧桌面入口，其他服务不再直接写 window 全局。 */
@Injectable({ providedIn: 'root' })
export class DesktopRuntimeBridgeService {
  private readonly document = inject(DOCUMENT);

  install(): void {
    const host = this.document.defaultView as RuntimeWindow | null;
    if (!host) return;

    host.__aiaoRuntimeBridge = {
      publish: globals => this.publish(globals)
    };
  }

  publish(globals: DesktopRuntimeGlobals): void {
    const host = this.document.defaultView as RuntimeWindow | null;
    if (!host) return;

    Object.assign(host, globals);
    host.__AIAO_DESKTOP_RUNTIME_LOADED__ = true;
  }
}
