import { Component, ViewEncapsulation, inject } from '@angular/core';

import { Session } from '../services/session';
import { Toast } from '../services/toast';
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

/** 舞台：按层叠顺序摆放壁纸、桌面、窗口、菜单栏、Dock、浮层、锁屏与开机画面。 */
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
    '[style.display]': '"contents"'
  }
})
export class DesktopShell {
  protected readonly toast = inject(Toast);
  protected readonly session = inject(Session);
}
