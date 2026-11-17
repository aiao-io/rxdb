import { DOCUMENT } from '@angular/common';
import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { DesktopData } from '../data/desktop-data';
import { DATA_LOCATION_KEY } from '../data/desktop-data-location';
import { Session } from '../services/session';
import { Toast } from '../services/toast';
import { WindowManager } from '../services/window-manager';
import { BootScreen } from './boot-screen';
import { DataProblemScreen } from './data-problem';
import { DesktopSurface } from './desktop-surface';
import { Dock } from './dock';
import { IconSprite } from './icon-sprite';
import { LockScreen } from './lock-screen';
import { Menubar } from './menubar';
import { OverlayLayer } from './overlay-layer';
import { Wallpaper } from './wallpaper';
import { WindowLayer } from './window-layer';

/**
 * 舞台：壁纸、菜单栏、窗口、Dock、桌面、浮层，再加锁屏与开机画面。
 *
 * 无障碍（ADESK-US-108）：DOM 顺序就是 Tab 顺序——菜单栏 → 窗口 → Dock → 桌面图标 → 浮层（各层的前后靠 z-index，
 * 与 DOM 顺序无关）。锁屏、开机画面、睡眠、本地数据问题的阻断界面盖在上面时，下面的桌面层整体 `inert`：
 * Tab 到不了、读屏读不到、点不到。
 */
@Component({
  selector: 'app-desktop-shell',
  imports: [
    Wallpaper,
    DesktopSurface,
    WindowLayer,
    Menubar,
    Dock,
    OverlayLayer,
    LockScreen,
    BootScreen,
    DataProblemScreen,
    IconSprite
  ],
  templateUrl: './desktop-shell.html',
  styleUrl: './desktop-shell.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"',
    '(window:storage)': 'checkLocation($event)',
    '(window:focus)': 'checkLocation()'
  }
})
export class DesktopShell {
  private readonly data = inject(DesktopData);
  private readonly windows = inject(WindowManager);
  private readonly document = inject(DOCUMENT);
  protected readonly replaced = toSignal(this.data.locationGuard.replaced$, { initialValue: false });
  protected readonly toast = inject(Toast);
  protected readonly session = inject(Session);
  /** 锁屏、开机画面、睡眠或本地数据问题的阻断界面盖住了桌面。 */
  protected readonly behind = computed(
    () =>
      this.session.locked() ||
      this.session.boot() !== null ||
      this.session.sleep() !== 'awake' ||
      this.data.problem() !== null
  );

  protected checkLocation(event?: StorageEvent): void {
    if (event && event.key !== DATA_LOCATION_KEY && event.key !== null) return;
    try {
      this.data.locationGuard.assertCurrent();
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error));
    }
  }

  protected async reloadRestored(): Promise<void> {
    if (await this.windows.closeAll()) this.document.location.reload();
  }
}
