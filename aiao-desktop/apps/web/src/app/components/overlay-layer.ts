import { Component, ViewEncapsulation, computed, inject } from '@angular/core';

import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { FocusTrap } from '../shared/focus-trap';
import { Launchpad } from './overlays/launchpad';
import { MissionControl } from './overlays/mission-control';
import { NotificationBanner } from './overlays/notification-banner';
import { NotificationCentre } from './overlays/notification-centre';
import { PopoverEntryView } from './overlays/popover-entry';
import { Spotlight } from './overlays/spotlight';

/**
 * 浮层：启动台、聚焦搜索、通知中心、Mission Control、菜单弹出层、通知横幅栈，以及屏幕亮度遮罩。
 * 三个全屏浮层与 Mission Control 各挂一个焦点陷阱（{@link FocusTrap}）：Tab 只在浮层里循环，关闭时焦点回到打开它之前的元素；
 * 通知横幅栈常驻渲染（[BANNER]，组件由 impl:overlays-b 提供）；亮度遮罩常驻，对读屏隐藏。
 */
@Component({
  selector: 'app-overlay-layer',
  imports: [FocusTrap, Launchpad, MissionControl, Spotlight, NotificationCentre, NotificationBanner, PopoverEntryView],
  templateUrl: './overlay-layer.html',
  styleUrl: './overlay-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class OverlayLayer {
  private readonly system = inject(SystemState);
  protected readonly overlays = inject(Overlays);
  protected readonly popover = inject(PopoverService);

  /** 用遮罩而不是给壁纸加 filter：带 filter 的元素会让背景模糊面板漏掉桌面图标。 */
  protected readonly dim = computed(() => ((1 - this.system.brightness()) * 0.78).toFixed(3));

  protected shield(event: MouseEvent): void {
    event.preventDefault();
    this.popover.close(false, 'outside');
  }
}
