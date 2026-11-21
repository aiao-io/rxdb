import { Component, ViewEncapsulation, inject } from '@angular/core';

import { DesktopWindow } from '../services/desktop-window';
import { WindowManager } from '../services/window-manager';
import { Icon } from '../shared/icon';
import { TrafficLights } from '../shared/traffic-lights';

/**
 * 应用载荷还没到（装载中）、装不上（失败）或有意先不装载（未启动）时窗口里显示的内容（D-18）：标题栏照常画出，窗口能拖、能关；
 * 装载中是一个转圈，失败时给出原因与「重试」——重试创建新的应用实例，不影响别的窗口。
 *
 * 未启动（ADESK-US-104）：刷新后恢复的重型应用窗口（终端、几猫3A大作）只重建外框，整块内容区是一个按钮，
 * 第一次点击（或键盘聚焦后按回车、空格）才装载应用；按钮可聚焦、有名称（Start 应用名）。
 */
@Component({
  selector: 'app-window-status',
  imports: [Icon, TrafficLights],
  templateUrl: './window-status.html',
  styleUrl: './window-status.scss',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents' }
})
export class WindowStatus {
  private readonly wm = inject(WindowManager);
  protected readonly win = inject(DesktopWindow);

  protected retry(): void {
    this.wm.retry(this.win.id);
  }

  /** 第一次点击未启动的窗口：装载应用。 */
  protected start(): void {
    this.wm.activate(this.win.id);
  }
}
