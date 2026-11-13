import { Service, inject } from '@angular/core';

import { DesktopAppId } from './desktop-apps';
import { DockState } from './dock-state';
import { Overlays } from './overlays';
import { WindowManager } from './window-manager';

/** 从 Dock、启动台或聚焦搜索激活一个应用：已开则调到前台，否则弹跳并打开。 */
@Service({ autoProvided: false })
export class AppLauncher {
  private readonly wm = inject(WindowManager);
  private readonly dock = inject(DockState);
  private readonly overlays = inject(Overlays);

  activate(appId: DesktopAppId): void {
    if (appId === 'launchpad') {
      this.overlays.toggleLaunchpad();
      return;
    }
    if (appId === 'trash') {
      this.wm.open('finder', { path: ['Trash'] });
      return;
    }
    const existing = this.wm.byApp(appId);
    if (!existing.length) {
      this.dock.bounce(appId);
      this.wm.open(appId);
      return;
    }
    const minimized = existing.find(win => win.minimized());
    if (minimized) {
      this.wm.unminimize(minimized.id);
      return;
    }
    const front = existing[existing.length - 1].id;
    this.wm.focus(front);
    /* 刷新后延后装载的窗口（终端、游戏）：从 Dock 等入口再次打开就是要用它，此刻装载。 */
    this.wm.activate(front);
  }
}
