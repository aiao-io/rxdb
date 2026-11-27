import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed, inject, input, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { RuntimeActivity } from '../../services/runtime-activity';
import { WindowManager } from '../../services/window-manager';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { METRIC_NOTES, METRIC_TABS, filterActivityRows, metricValue } from './activity-metrics';

/** 标签：Windows 是原有的窗口表（保留原选择器），其余五个是演示度量的进程视图。 */
const TABS = ['Windows', ...METRIC_TABS] as const;

type ActivityTab = (typeof TABS)[number];

/** 各标签的显示文案 key（标签值本身是内部标识，界面按语言解析显示）。 */
const TAB_LABEL_KEYS: Readonly<Record<ActivityTab, string>> = {
  Windows: 'apps.activity.tab.windows',
  CPU: 'apps.activity.tab.cpu',
  Memory: 'apps.activity.tab.memory',
  Energy: 'apps.activity.tab.energy',
  Disk: 'apps.activity.tab.disk',
  Network: 'apps.activity.tab.network'
};

/** 结束进程的确认弹层：Cancel 或 Esc 关闭，Close 才执行关闭窗口。 */
@Component({
  selector: 'app-activity-close-panel',
  imports: [FocusTrap],
  host: { class: 'pop', style: 'width: 320px; padding: 14px' },
  template: `
    <div
      [attr.aria-label]="i18n.t('apps.activity.closeWindow')"
      (keydown.escape)="popover.close()"
      appFocusTrap
      aria-modal="true"
      role="dialog"
      style="display: flex; flex-direction: column; gap: 12px"
    >
      <h2 style="font-size: 14px; margin: 0">{{ i18n.t('apps.activity.closeWindowTitle', { name: title() }) }}</h2>
      <p style="font-size: 12px; color: var(--txt-2); margin: 0">
        {{ i18n.t('apps.activity.closeWindowMessage') }}
      </p>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <button class="btn" (click)="popover.close()" data-aclose-cancel tabindex="0" type="button">
          {{ i18n.t('apps.activity.cancel') }}
        </button>
        <button class="btn" (click)="confirmClose()" data-aclose-confirm tabindex="0" type="button">
          {{ i18n.t('apps.activity.close') }}
        </button>
      </div>
    </div>
  `
})
export class ActivityClosePanel {
  protected readonly popover = inject(PopoverService);
  protected readonly i18n = useI18n();
  /** 窗口标题，确认文案里原样展示。 */
  readonly title = input.required<string>();
  /** 确认后执行关闭的回调。 */
  readonly close = input.required<() => void>();

  protected confirmClose(): void {
    this.popover.close(true);
    this.close()();
  }
}

/** 活动监视器：窗口表加 CPU/内存/能耗/磁盘/网络五个演示度量标签，支持搜索与结束进程确认。 */
@Component({
  selector: 'app-activity-monitor',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './activity-monitor.html'
})
export class ActivityMonitorApp {
  private readonly popover = inject(PopoverService);
  protected readonly wm = inject(WindowManager);
  protected readonly activity = inject(RuntimeActivity);
  protected readonly i18n = useI18n();

  protected readonly tabs = TABS;
  protected readonly tab = signal<ActivityTab>('Windows');
  protected readonly query = signal('');
  /** 搜索过滤后的进程行；查询为空时是全部窗口。 */
  protected readonly rows = computed(() => filterActivityRows(this.activity.rows(), this.query()));
  /** 度量标签下的行：窗口 + 稳定生成的演示读数。 */
  protected readonly metric = computed(() => {
    const tab = this.tab();
    if (tab === 'Windows') return [];
    return this.rows().map(row => ({ row, value: metricValue(tab, `${row.appId}|${row.id}`) }));
  });
  protected readonly metricNote = computed(() => {
    const tab = this.tab();
    return tab === 'Windows' ? '' : this.i18n.t(METRIC_NOTES[tab]);
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('activity')));
  }

  /** 标签的显示名（内部标识是英文，界面按当前语言解析）。 */
  protected tabLabel(tab: ActivityTab): string {
    return this.i18n.t(TAB_LABEL_KEYS[tab]);
  }

  protected show(id: string): void {
    if (this.wm.get(id)?.minimized()) this.wm.unminimize(id);
    else this.wm.focus(id);
  }

  /** 结束进程前先确认（macOS 活动监视器同款）。 */
  protected requestClose(id: string, title: string): void {
    this.popover.openComponent(
      ActivityClosePanel,
      { x: innerWidth / 2 - 160, y: innerHeight / 2 - 80, origin: 'top left', focus: true },
      { title, close: () => this.wm.close(id) }
    );
  }
}
