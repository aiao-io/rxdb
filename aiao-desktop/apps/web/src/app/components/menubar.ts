import { Component, ElementRef, Type, ViewEncapsulation, computed, inject, signal, viewChildren } from '@angular/core';

import { StatusKey, StatusSnapshot, statusLabel } from '../services/aria';
import { Clock } from '../services/clock';
import { DesktopMenus } from '../services/desktop-menus';
import { barIndex, isKeyboardClick } from '../services/focus-order';
import { MenuEntry } from '../services/menu';
import { Overlays } from '../services/overlays';
import { PopoverCloseReason, PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { WindowManager } from '../services/window-manager';
import { DAYS3, MONS3, NBSP, time12 } from '../shared/format';
import { Icon } from '../shared/icon';
import { BatteryIcon } from '../shared/status-glyphs';
import { ControlCentre } from './menubar/control-centre';
import { BatteryPanel, BluetoothPanel, SoundPanel, WifiPanel } from './menubar/status-panels';

/** 鼠标按下之后这段时间（毫秒）内到达的同一个标题的 `click` 是同一次按下的尾声（读屏的「按下」会连发 mousedown 与 click）。 */
const PRESS_ECHO_MS = 600;

/** 状态图标在屏幕上从左到右的顺序。 */
const STATUS_ORDER: readonly StatusKey[] = ['bt', 'vol', 'batt', 'wifi', 'spot', 'cc', 'clock'];

const PANELS: Readonly<Partial<Record<StatusKey, Type<unknown>>>> = {
  wifi: WifiPanel,
  bt: BluetoothPanel,
  batt: BatteryPanel,
  vol: SoundPanel,
  cc: ControlCentre
};

/**
 * 菜单栏：Apple 菜单、前台应用的菜单、状态图标与时钟。
 *
 * 无障碍（ADESK-US-108）：左侧是 `role="menubar"`，Apple 与应用菜单标题是 `menuitem`（`aria-haspopup="menu"`、
 * `aria-expanded`）；右侧状态图标与时钟是 `toolbar` 里的按钮（打开的是面板，`aria-haspopup="dialog"`）。
 * 每个标题都能 Tab 到；焦点在菜单栏时左右方向键、Home、End 在标题之间移动，Enter、空格、向下（向上）方向键展开菜单、
 * 焦点交给第一项（最后一项）；菜单里左右方向键切到相邻的菜单，Esc 关闭并把焦点还给标题，执行命令后焦点去前台窗口。
 * 鼠标仍是 macOS 的习惯：按下就展开、再按同一个标题收起，不移动焦点（`mousedown` 取消默认行为，
 * 文本框里选中的文字不会因为点菜单而丢焦点——「编辑」菜单靠它作用于当前输入框）。
 */
@Component({
  selector: 'app-menubar',
  imports: [Icon, BatteryIcon],
  templateUrl: './menubar.html',
  styleUrl: './menubar.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '[style.display]': '"contents"'
  }
})
export class Menubar {
  private readonly menus = inject(DesktopMenus);
  private readonly popover = inject(PopoverService);
  private readonly clock = inject(Clock);
  private readonly owner = computed(() => {
    const win = this.wm.menubarOwner();
    if (!win) return { name: 'Finder', sections: this.menus.finderFallback() };
    return { name: win.app.name, sections: win.menus()?.() ?? this.menus.standard(win.appId) };
  });
  private readonly menuItems = viewChildren<ElementRef<HTMLElement>>('menuItem');
  private readonly statusItems = viewChildren<ElementRef<HTMLElement>>('statusItem');
  /** 最近一次鼠标按下（读屏的「按下」也会发 mousedown）：随后到达的 click 是它的尾声，不再处理一遍。 */
  private lastPress: { readonly key: string; readonly at: number } | null = null;
  protected readonly wm = inject(WindowManager);
  protected readonly system = inject(SystemState);
  protected readonly overlays = inject(Overlays);

  protected readonly openMenu = signal<string | null>(null);
  protected readonly openStatus = signal<StatusKey | null>(null);

  protected readonly titles = computed(() => [
    this.owner().name,
    ...this.owner().sections.map(section => section.label)
  ]);

  /** 菜单的键：Apple 菜单是 `apple`，其余是标题的下标；顺序即屏幕上从左到右。 */
  protected readonly menuKeys = computed(() => ['apple', ...this.titles().map((_, index) => String(index))]);

  /** 状态图标的无障碍名称：图标只是个字形，名称要说出是什么、现在什么状态。 */
  protected readonly labels = computed(() => {
    const snapshot: StatusSnapshot = {
      bluetooth: this.system.bluetooth(),
      wifi: this.system.wifi(),
      wifiName: this.system.wifiName(),
      battery: this.system.battery(),
      charging: this.system.charging(),
      volume: this.system.volume(),
      muted: this.system.muted()
    };
    return {
      bt: statusLabel('bt', snapshot),
      vol: statusLabel('vol', snapshot),
      batt: statusLabel('batt', snapshot),
      wifi: statusLabel('wifi', snapshot),
      spot: statusLabel('spot', snapshot),
      cc: statusLabel('cc', snapshot)
    };
  });

  protected readonly volumeIcon = computed(() => {
    const volume = this.system.volume();
    if (this.system.muted() || volume === 0) return 'g-vol-mute';
    return volume < 0.5 ? 'g-vol-lo' : 'g-vol';
  });

  protected readonly clockText = computed(() => {
    const d = this.clock.now();
    return `${DAYS3[d.getDay()]}${NBSP}${MONS3[d.getMonth()]}${NBSP}${d.getDate()}${NBSP}${NBSP}${time12(d)}`;
  });

  /** 鼠标按下：展开；再按同一个标题收起。没有按键信息的 mousedown（读屏的「按下」、脚本派发）按键盘打开处理。 */
  protected toggleMenu(event: MouseEvent, key: string): void {
    event.preventDefault();
    this.lastPress = { key, at: event.timeStamp };
    this.toggle(event.currentTarget as HTMLElement, key, event.detail === 0);
  }

  /** 键盘（Enter、空格）或读屏的「按下」：click 的 detail 为 0；鼠标点击已经在 mousedown 上处理过。 */
  protected pressMenu(event: MouseEvent, key: string): void {
    if (!isKeyboardClick(event) || this.isEcho(event, key)) return;
    this.toggle(event.currentTarget as HTMLElement, key, true);
  }

  /** 已有菜单打开时，划过别的标题就切换过去。 */
  protected hoverMenu(event: MouseEvent, key: string): void {
    const open = this.openMenu();
    if (open !== null && open !== key) this.open(event.currentTarget as HTMLElement, key);
  }

  /** 焦点在菜单栏标题上：左右方向键、Home、End 移动；向下、向上方向键展开菜单（焦点交给第一项、最后一项）。 */
  protected barKey(event: KeyboardEvent, key: string): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open(event.currentTarget as HTMLElement, key, event.key === 'ArrowUp' ? 'last' : true);
      return;
    }
    this.moveFocus(event, this.menuItems(), this.menuKeys().indexOf(key));
  }

  /** 状态图标是工具栏里的按钮：左右方向键、Home、End 移动，Enter 与空格走 click。 */
  protected statusKey(event: KeyboardEvent, key: StatusKey): void {
    this.moveFocus(event, this.statusItems(), STATUS_ORDER.indexOf(key));
  }

  /** 鼠标按下状态图标：与菜单一样按下就展开；时钟开关通知中心。 */
  protected toggleStatus(event: MouseEvent, key: StatusKey): void {
    event.preventDefault();
    this.lastPress = { key, at: event.timeStamp };
    this.status(event.currentTarget as HTMLElement, key, event.detail === 0);
  }

  protected pressStatus(event: MouseEvent, key: StatusKey): void {
    if (!isKeyboardClick(event) || this.isEcho(event, key)) return;
    this.status(event.currentTarget as HTMLElement, key, true);
  }

  /** 遮罩不覆盖菜单栏，所以菜单栏的空白处要自己负责关闭。 */
  protected deadSpace(event: MouseEvent): void {
    if (!(event.target as Element).closest('.mb-item,.mb-st')) this.popover.close(false, 'outside');
  }

  protected barMenu(event: MouseEvent): void {
    event.preventDefault();
    this.popover.contextMenu(
      event,
      [
        { id: 'a', label: 'Menu Bar Settings…', run: () => this.wm.open('settings', { section: 'appearance' }) },
        { id: 'c', label: 'Control Centre Settings…', run: () => this.wm.open('settings', { section: 'appearance' }) }
      ],
      'Menu bar'
    );
  }

  private isEcho(event: MouseEvent, key: string): boolean {
    return this.lastPress?.key === key && event.timeStamp - this.lastPress.at < PRESS_ECHO_MS;
  }

  private moveFocus(event: KeyboardEvent, items: readonly ElementRef<HTMLElement>[], at: number): void {
    const next = barIndex(event.key, at, items.length);
    if (next === null) return;
    event.preventDefault();
    items[next].nativeElement.focus();
  }

  private toggle(anchor: HTMLElement, key: string, keyboard: boolean): void {
    if (this.openMenu() === key) {
      this.popover.close();
      return;
    }
    this.open(anchor, key, keyboard);
  }

  private status(anchor: HTMLElement, key: StatusKey, keyboard: boolean): void {
    /* 通知中心打开时时钟带着 open，所以时钟要先于「已打开就关闭」处理。 */
    if (key === 'clock') {
      this.overlays.toggleNotifications();
      return;
    }
    if (this.openStatus() === key) {
      this.popover.close();
      return;
    }
    if (key === 'spot') {
      this.overlays.openSpotlight();
      return;
    }
    const panel = PANELS[key];
    if (!panel) return;
    const rect = anchor.getBoundingClientRect();
    this.openStatus.set(key);
    this.popover.openComponent(panel, {
      x: rect.right + 6,
      y: rect.bottom + 4,
      right: true,
      origin: 'top right',
      ...(keyboard ? { focus: true } : {}),
      onClose: reason => this.statusClosed(key, anchor, keyboard, reason)
    });
  }

  private open(anchor: HTMLElement, key: string, focus: boolean | 'last' = false): void {
    const rect = anchor.getBoundingClientRect();
    this.openMenu.set(key);
    this.popover.openMenu(
      this.items(key),
      {
        x: rect.left,
        y: rect.bottom + 2,
        origin: 'top left',
        label: key === 'apple' ? 'Apple' : this.titles()[Number(key)],
        ...(focus ? { focus } : {}),
        step: direction => this.stepMenu(direction),
        onClose: reason => this.menuClosed(key, anchor, reason)
      },
      'wide'
    );
  }

  /** 菜单里的左右方向键：切到相邻的菜单（首尾相接），焦点留在新菜单的第一项。 */
  private stepMenu(direction: -1 | 1): void {
    const keys = this.menuKeys();
    const current = keys.indexOf(this.openMenu() ?? '');
    if (current < 0) return;
    const next = (current + direction + keys.length) % keys.length;
    this.open(this.menuItems()[next].nativeElement, keys[next], true);
  }

  private items(key: string): readonly MenuEntry[] {
    if (key === 'apple') return this.menus.apple();
    const index = Number(key);
    const owner = this.owner();
    if (index === 0) return this.menus.about(owner.name);
    return owner.sections[index - 1]?.items ?? [];
  }

  /**
   * 菜单关了，焦点去哪：Esc 与 Tab 回到标题；执行了命令，焦点去前台窗口（命令作用于它，「编辑」菜单靠焦点所在的输入框），
   * 没有窗口就回到标题；点外面、被别的菜单顶掉时焦点已经在用户要去的地方，不动。
   */
  private menuClosed(key: string, anchor: HTMLElement, reason: PopoverCloseReason): void {
    if (this.openMenu() === key) this.openMenu.set(null);
    if (reason === 'escape' || reason === 'tab') anchor.focus();
    else if (reason === 'command') this.focusFrontOr(anchor);
  }

  /** 面板关了：键盘打开的，焦点回到图标（Esc、按了面板里的行）；鼠标打开的不动焦点。 */
  private statusClosed(key: StatusKey, anchor: HTMLElement, keyboard: boolean, reason: PopoverCloseReason): void {
    if (this.openStatus() === key) this.openStatus.set(null);
    if (keyboard && reason !== 'outside' && reason !== 'replaced') anchor.focus();
  }

  private focusFrontOr(anchor: HTMLElement): void {
    const front = this.wm.front();
    if (front) this.wm.focus(front.id);
    else anchor.focus();
  }
}
