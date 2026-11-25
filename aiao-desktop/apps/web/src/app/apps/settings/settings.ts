import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { RETURNS_FOCUS, PopoverCloseReason, PopoverService } from '../../services/popover';
import { SystemState } from '../../services/system-state';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { USER_PROFILE } from '../../shared/user-profile';
import { AccountMenu } from './account-menu';
import { AppearancePane } from './panes/appearance-pane';
import { BatteryPane } from './panes/battery-pane';
import { BluetoothPane } from './panes/bluetooth-pane';
import { DisplaysPane } from './panes/displays-pane';
import { DockPane } from './panes/dock-pane';
import { GeneralPane } from './panes/general-pane';
import { NetworkPane } from './panes/network-pane';
import { NotificationsPane } from './panes/notifications-pane';
import { PrivacyPane } from './panes/privacy-pane';
import { SoundPane } from './panes/sound-pane';
import { WallpaperPane } from './panes/wallpaper-pane';
import { WifiPane } from './panes/wifi-pane';
import { filterSettingsGroups, findSection, SETTINGS_GROUPS } from './settings-data';

/** 系统设置：侧栏选分区，右侧按分区换面板。 */
@Component({
  selector: 'app-settings',
  imports: [
    AppearancePane,
    BatteryPane,
    BluetoothPane,
    DisplaysPane,
    DockPane,
    GeneralPane,
    Icon,
    NetworkPane,
    NgOptimizedImage,
    NotificationsPane,
    PrivacyPane,
    SoundPane,
    TrafficLights,
    WallpaperPane,
    WifiPane
  ],
  host: { style: 'display: contents' },
  templateUrl: './settings.html'
})
export class SettingsApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly selected = signal(this.win.options.section || 'appearance');
  private readonly generation = signal(0);

  protected readonly query = signal('');
  protected readonly visibleGroups = computed(() => filterSettingsGroups(SETTINGS_GROUPS, this.query()));
  protected readonly system = inject(SystemState);
  protected readonly avatar = USER_PROFILE.avatar;
  protected readonly section = computed(() => findSection(this.selected()));
  /** 面板重绘：编号一变，面板的元素整块重建，只改外观的开关回到初始值。 */
  protected readonly renders = computed(() => [{ id: this.generation() }]);

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('settings')));

    /* 外观页开着时切换深浅色，页面会重绘（原来监听了主题事件）。 */
    let theme = this.system.theme();
    effect(() => {
      const next = this.system.theme();
      if (next === theme) return;
      theme = next;
      if (untracked(this.section).id === 'appearance') this.refresh();
    });
  }

  protected select(id: string): void {
    this.selected.set(id);
    this.refresh();
  }

  /**
   * 头像上的账户弹出层（退出入口）：弹出层浮在窗口上面，锚点取头像的屏幕坐标。菜单开着时全屏护罩
   * 会接住外面的点击（点头像即收起），键盘打开的（或读屏按下的）焦点进弹出层，关闭后回到头像。
   */
  protected openAccount(event: Event, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const keyboard = event instanceof KeyboardEvent || (event instanceof MouseEvent && event.detail === 0);
    this.popover.openComponent(AccountMenu, {
      x: rect.left,
      y: rect.bottom + 4,
      origin: 'top left',
      ...(keyboard ?
        {
          focus: true,
          onClose: (reason: PopoverCloseReason) => {
            if (RETURNS_FOCUS.has(reason)) anchor.focus();
          }
        }
      : {})
    });
  }

  protected refresh(): void {
    this.generation.update(count => count + 1);
  }
}
