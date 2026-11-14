import { Component, computed, inject } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { ErasePanel, FirstAidPanel } from './disk-panels';

const USED = 842;
const TOTAL = 2048;

/** [分类, 占用 GB, 颜色] */
const SEGMENTS = [
  ['Apps', 214, '#0a84ff'],
  ['Documents', 168, '#30d158'],
  ['Photos', 296, '#ff9f0a'],
  ['System', 164, '#8e8e93']
] as const;

const FACTS = [
  ['Mount Point', '/'],
  ['Capacity', '2.05 TB'],
  ['Available', `${((TOTAL - USED) / 1000).toFixed(2)} TB (${(100 - (USED / TOTAL) * 100).toFixed(0)}%)`],
  ['Used', `${(USED / 1000).toFixed(2)} TB`],
  ['Type', 'APFS Volume'],
  ['Owners', 'Enabled'],
  ['Connection', 'PCI-Express'],
  ['Device', 'disk3s5s1']
] as const;

/** 磁盘工具：卷的容量分布与详情；First Aid 跑进度面板，Erase 先确认再拒绝（启动盘不能抹）。 */
@Component({
  selector: 'app-disk-utility',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './disk-utility.html'
})
export class DiskUtilityApp {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);

  protected readonly total = TOTAL;
  protected readonly free = TOTAL - USED;
  protected readonly segments = SEGMENTS;
  protected readonly facts = FACTS;

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('diskutil')));
  }

  protected firstAid(): void {
    this.popover.openComponent(FirstAidPanel, { x: innerWidth / 2 - 200, y: 160, origin: 'top center' });
  }

  protected erase(): void {
    this.popover.openComponent(ErasePanel, { x: innerWidth / 2 - 170, y: 180, origin: 'top center' });
  }

  protected addVolume(): void {
    this.toast.show('Add APFS Volume — container is at capacity');
  }

  protected removeVolume(): void {
    this.toast.show('Select a non-system volume to remove');
  }
}
