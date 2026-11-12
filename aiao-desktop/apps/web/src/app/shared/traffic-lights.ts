import { Component, inject } from '@angular/core';

import { DesktopWindow } from '../services/desktop-window';
import { WindowManager } from '../services/window-manager';
import { Icon } from './icon';

/** 窗口左上角的关闭、最小化、缩放按钮；应用把它放在自己标题栏或侧栏顶部。 */
@Component({
  selector: 'app-traffic-lights',
  imports: [Icon],
  host: { class: 'tl' },
  template: `
    <b class="c" (click)="close($event)" (keydown.enter)="close($event)" data-w="close" tabindex="-1"
      ><svg appIcon="g-x"></svg
    ></b>
    <b class="m" (click)="minimize($event)" (keydown.enter)="minimize($event)" data-w="min" tabindex="-1"
      ><svg appIcon="g-minus"></svg
    ></b>
    <b class="f" (click)="zoom($event)" (keydown.enter)="zoom($event)" data-w="zoom" tabindex="-1"
      ><svg appIcon="g-chev-ud"></svg
    ></b>
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
