import { afterNextRender, Component, inject, ViewEncapsulation } from '@angular/core';
import { DesktopRuntimeService } from '../services/desktop-runtime.service';
import { BootScreen } from './boot-screen';
import { DesktopSurface } from './desktop-surface';
import { Dock } from './dock';
import { IconSprite } from './icon-sprite';
import { LockScreen } from './lock-screen';
import { Menubar } from './menubar';
import { OverlayLayer } from './overlay-layer';
import { Wallpaper } from './wallpaper';
import { WindowLayer } from './window-layer';

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
  private readonly runtime = inject(DesktopRuntimeService);

  constructor() {
    afterNextRender(() => this.runtime.start());
  }
}
