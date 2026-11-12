import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { DESKTOP_APPS, LAUNCH_ORDER } from '../services/desktop-apps';
import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { Icon } from '../shared/icon';
import { LAUNCHPAD_PER_PAGE, Launchpad } from './overlays/launchpad';
import { NotificationCentre } from './overlays/notification-centre';
import { PopoverEntryView } from './overlays/popover-entry';
import { Spotlight } from './overlays/spotlight';

/** 浮层：启动台、聚焦搜索、通知中心、菜单弹出层，以及屏幕亮度遮罩。 */
@Component({
  selector: 'app-overlay-layer',
  imports: [Icon, Launchpad, Spotlight, NotificationCentre, PopoverEntryView],
  templateUrl: './overlay-layer.html',
  styleUrl: './overlay-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class OverlayLayer {
  private readonly system = inject(SystemState);
  private readonly genie = viewChild<ElementRef<HTMLElement>>('genie');
  protected readonly overlays = inject(Overlays);
  protected readonly popover = inject(PopoverService);
  protected readonly apps = inject(DESKTOP_APPS);

  /** 用遮罩而不是给壁纸加 filter：带 filter 的元素会让背景模糊面板漏掉桌面图标。 */
  protected readonly dim = computed(() => ((1 - this.system.brightness()) * 0.78).toFixed(3));
  protected readonly warmApps = LAUNCH_ORDER.slice(0, LAUNCHPAD_PER_PAGE);
  protected readonly warmPanels = signal(false);
  protected readonly warmGenie = signal(false);

  constructor() {
    /* 启动台和通知中心的全屏模糊、以及第一次「神灯」动画，首次光栅化都要付一笔，
       趁空闲时在看不见的节点上预先付掉。 */
    requestIdleCallback(
      () => {
        this.warmPanels.set(true);
        this.warmGenie.set(true);
      },
      { timeout: 2600 }
    );
    afterRenderEffect(() => {
      if (!this.warmPanels()) return;
      requestAnimationFrame(() => requestAnimationFrame(() => this.warmPanels.set(false)));
    });
    afterRenderEffect(() => {
      const genie = this.genie()?.nativeElement;
      if (!genie) return;
      const animation = genie.animate(
        [
          {
            transform: 'translate(0px,0px) scale(1,1)',
            clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)',
            borderRadius: '11px'
          },
          {
            transform: 'translate(120px,300px) scale(.3,.3)',
            clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)',
            borderRadius: '22px',
            offset: 0.55
          },
          {
            transform: 'translate(240px,600px) scale(.06,.06)',
            clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)',
            borderRadius: '40px'
          }
        ],
        { duration: 120, easing: 'cubic-bezier(.42,.02,.58,1)' }
      );
      animation.onfinish = () => this.warmGenie.set(false);
    });
  }

  protected shield(event: MouseEvent): void {
    event.preventDefault();
    this.popover.close();
  }
}
