import { Component, inject } from '@angular/core';

import { DesktopWindow } from '../services/desktop-window';
import { WindowManager } from '../services/window-manager';
import { Icon } from './icon';

/**
 * 窗口左上角的关闭、最小化、缩放按钮；应用把它放在自己标题栏或侧栏顶部。
 * 三个都是原生按钮（Enter、空格触发，Tab 能到，名称是 Close / Minimize / Zoom），符号是装饰。
 */
@Component({
  selector: 'app-traffic-lights',
  imports: [Icon],
  host: { class: 'tl' },
  template: `
    <button class="c" (click)="close($event)" aria-label="Close" data-w="close" tabindex="0" type="button">
      <svg appIcon="g-x"></svg>
    </button>
    <button class="m" (click)="minimize($event)" aria-label="Minimize" data-w="min" tabindex="0" type="button">
      <svg appIcon="g-minus"></svg>
    </button>
    <button class="f" (click)="zoom($event)" aria-label="Zoom" data-w="zoom" tabindex="0" type="button">
      <svg appIcon="g-chev-ud"></svg>
    </button>
  `
})
export class TrafficLights {
  private readonly win = inject(DesktopWindow);
  private readonly wm = inject(WindowManager);

  protected close(event: Event): void {
    event.stopPropagation();
    this.wm.close(this.win.id);
  }

  protected minimize(event: Event): void {
    event.stopPropagation();
    this.wm.minimize(this.win.id);
  }

  protected zoom(event: Event): void {
    event.stopPropagation();
    this.wm.zoom(this.win.id);
  }
}
