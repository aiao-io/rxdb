import { Component, Type, ViewEncapsulation, computed, inject, signal } from '@angular/core';

import { Clock } from '../services/clock';
import { DesktopMenus } from '../services/desktop-menus';
import { MenuEntry } from '../services/menu';
import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { SystemState } from '../services/system-state';
import { WindowManager } from '../services/window-manager';
import { DAYS3, MONS3, NBSP, time12 } from '../shared/format';
import { Icon } from '../shared/icon';
import { BatteryIcon } from '../shared/status-glyphs';
import { ControlCentre } from './menubar/control-centre';
import { BatteryPanel, BluetoothPanel, SoundPanel, WifiPanel } from './menubar/status-panels';

type StatusKey = 'bt' | 'vol' | 'batt' | 'wifi' | 'spot' | 'cc' | 'clock';

const PANELS: Readonly<Partial<Record<StatusKey, Type<unknown>>>> = {
  wifi: WifiPanel,
  bt: BluetoothPanel,
  batt: BatteryPanel,
  vol: SoundPanel,
  cc: ControlCentre
};

/** 菜单栏：Apple 菜单、前台应用的菜单、状态图标与时钟。 */
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
  protected readonly wm = inject(WindowManager);
  protected readonly system = inject(SystemState);
  protected readonly overlays = inject(Overlays);

  protected readonly openMenu = signal<string | null>(null);
  protected readonly openStatus = signal<StatusKey | null>(null);

  protected readonly titles = computed(() => [
    this.owner().name,
    ...this.owner().sections.map(section => section.label)
  ]);

  protected readonly volumeIcon = computed(() => {
    const volume = this.system.volume();
    if (this.system.muted() || volume === 0) return 'g-vol-mute';
    return volume < 0.5 ? 'g-vol-lo' : 'g-vol';
  });

  protected readonly clockText = computed(() => {
    const d = this.clock.now();
    return `${DAYS3[d.getDay()]}${NBSP}${MONS3[d.getMonth()]}${NBSP}${d.getDate()}${NBSP}${NBSP}${time12(d)}`;
  });

  /** 点击打开；再点同一个标题关闭。 */
  protected toggleMenu(event: MouseEvent, key: string): void {
    event.preventDefault();
    if (this.openMenu() === key) {
      this.popover.close();
      return;
    }
    this.open(event.currentTarget as HTMLElement, key);
  }

  /** 已有菜单打开时，划过别的标题就切换过去。 */
  protected hoverMenu(event: MouseEvent, key: string): void {
    const open = this.openMenu();
    if (open !== null && open !== key) this.open(event.currentTarget as HTMLElement, key);
  }

  protected status(event: MouseEvent, key: StatusKey): void {
    event.preventDefault();
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
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.openStatus.set(key);
    this.popover.openComponent(panel, {
      x: rect.right + 6,
      y: rect.bottom + 4,
      right: true,
      origin: 'top right',
      onClose: () => this.clearStatus(key)
    });
  }

  /** 遮罩不覆盖菜单栏，所以菜单栏的空白处要自己负责关闭。 */
  protected deadSpace(event: MouseEvent): void {
    if (!(event.target as Element).closest('.mb-item,.mb-st')) this.popover.close();
  }

  protected barMenu(event: MouseEvent): void {
    event.preventDefault();
    this.popover.contextMenu(event, [
      { id: 'a', label: 'Menu Bar Settings…', run: () => this.wm.open('settings', { section: 'appearance' }) },
      { id: 'c', label: 'Control Centre Settings…', run: () => this.wm.open('settings', { section: 'appearance' }) }
    ]);
  }

  private open(anchor: HTMLElement, key: string): void {
    const rect = anchor.getBoundingClientRect();
    this.openMenu.set(key);
    this.popover.openMenu(
      this.items(key),
      { x: rect.left, y: rect.bottom + 2, origin: 'top left', onClose: () => this.clearMenu(key) },
      'wide'
    );
  }

  private items(key: string): readonly MenuEntry[] {
    if (key === 'apple') return this.menus.apple();
    const index = Number(key);
    const owner = this.owner();
    if (index === 0) return this.menus.about(owner.name);
    return owner.sections[index - 1]?.items ?? [];
  }

  private clearMenu(key: string): void {
    if (this.openMenu() === key) this.openMenu.set(null);
  }

  private clearStatus(key: StatusKey): void {
    if (this.openStatus() === key) this.openStatus.set(null);
  }
}
