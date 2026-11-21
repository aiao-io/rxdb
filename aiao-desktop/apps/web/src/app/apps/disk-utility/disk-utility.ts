import { Component, computed, inject, signal } from '@angular/core';

import { DesktopBackup, DesktopStorageHealth } from '../../services/desktop-backup';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { BackupPanel } from './backup-panel';
import { ErasePanel, FirstAidPanel } from './disk-panels';

const bytes = (value: number | null): string =>
  value === null ? 'Not reported' : `${(value / 1024 / 1024).toFixed(1)} MiB`;

@Component({
  selector: 'app-disk-utility',
  imports: [Icon, TrafficLights, BackupPanel],
  host: { style: 'display: contents' },
  templateUrl: './disk-utility.html'
})
export class DiskUtilityApp {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly backup = inject(DesktopBackup);
  private readonly win = inject(DesktopWindow);
  protected readonly health = signal<DesktopStorageHealth | null>(null);
  protected readonly checking = signal(false);
  protected readonly facts = computed(() => {
    const value = this.health();
    if (!value) return [['Storage', 'Checking…']];
    return [
      ['Origin', location.origin],
      ['Origin usage estimate', bytes(value.usage)],
      ['Origin quota estimate', bytes(value.quota)],
      ['Persistent storage', value.persisted ? 'Granted' : 'Not granted'],
      ['File storage (OPFS)', value.opfs ? 'Available' : 'Unavailable']
    ];
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('diskutil')));
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.checking.set(true);
    try {
      this.health.set(await this.backup.health());
    } finally {
      this.checking.set(false);
    }
  }

  protected async persist(): Promise<void> {
    try {
      this.toast.show(
        (await this.backup.persist()) ?
          'Persistent storage granted.'
        : 'The browser did not grant persistent storage. Keep an external backup.'
      );
      await this.refresh();
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error));
    }
  }

  protected firstAid(event: Event): void {
    const anchor = event.currentTarget as HTMLElement;
    this.popover.openComponent(FirstAidPanel, {
      x: innerWidth / 2 - 200,
      y: 160,
      origin: 'top center',
      focus: true,
      onClose: () => anchor.focus()
    });
  }

  protected erase(event: Event): void {
    const anchor = event.currentTarget as HTMLElement;
    this.popover.openComponent(
      ErasePanel,
      { x: innerWidth / 2 - 170, y: 180, origin: 'top center', focus: true, onClose: () => anchor.focus() },
      { windowId: this.win.id }
    );
  }
}
