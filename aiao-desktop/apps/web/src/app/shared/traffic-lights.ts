import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, inject } from '@angular/core';

import { DesktopWindow } from '../services/desktop-window';
import { WindowManager } from '../services/window-manager';
import { Icon } from './icon';

/**
 * 窗口左上角的关闭、最小化、缩放按钮；应用把它放在自己标题栏或侧栏顶部。
 * 三个都是原生按钮（Enter、空格触发，Tab 能到，名称是 Close / Minimize / Zoom），符号是装饰。
 *
 * macOS 修饰键：⌥+关闭=关闭该应用全部窗口，⌥+最小化=最小化该应用全部窗口；
 * 绿键单击=全屏空间（再点或 Esc 退出），⌥+绿键=Zoom（填满菜单栏下方）。
 */
@Component({
  selector: 'app-traffic-lights',
  imports: [Icon],
  host: { class: 'tl' },
  template: `
    <button
      class="c"
      [attr.aria-label]="i18n.t('shell.window.close')"
      (click)="close($event)"
      data-w="close"
      tabindex="0"
      type="button"
    >
      <svg appIcon="g-x"></svg>
    </button>
    <button
      class="m"
      [attr.aria-label]="i18n.t('shell.window.minimize')"
      (click)="minimize($event)"
      data-w="min"
      tabindex="0"
      type="button"
    >
      <svg appIcon="g-minus"></svg>
    </button>
    <button
      class="f"
      [attr.aria-label]="i18n.t('shell.window.zoom')"
      (click)="zoom($event)"
      data-w="zoom"
      tabindex="0"
      type="button"
    >
      <svg appIcon="g-chev-ud"></svg>
    </button>
  `
})
export class TrafficLights {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);
  protected readonly i18n = useI18n();

  protected close(event: MouseEvent): void {
    event.stopPropagation();
    if (event.altKey) void this.wm.closeApp(this.win.appId);
    else this.wm.close(this.win.id);
  }

  protected minimize(event: MouseEvent): void {
    event.stopPropagation();
    if (event.altKey) this.wm.minimizeApp(this.win.appId);
    else this.wm.minimize(this.win.id);
  }

  protected zoom(event: MouseEvent): void {
    event.stopPropagation();
    if (event.altKey) this.wm.zoom(this.win.id);
    else this.wm.toggleFullscreen(this.win.id);
  }
}
