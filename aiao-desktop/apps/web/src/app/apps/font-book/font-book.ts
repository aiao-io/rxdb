import { Component, computed, inject, signal } from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

/** [字体族, font-family 声明, 字重说明] */
const FONTS = [
  ['SF Pro', '-apple-system,BlinkMacSystemFont,Inter,sans-serif', 'Regular · Medium · Semibold · Bold'],
  ['Inter', 'Inter,sans-serif', 'Variable 100–900'],
  ['Helvetica Neue', '"Helvetica Neue",Helvetica,sans-serif', 'Regular · Bold · Italic'],
  ['Georgia', 'Georgia,serif', 'Regular · Italic · Bold'],
  ['Times New Roman', '"Times New Roman",Times,serif', 'Regular · Bold'],
  ['JetBrains Mono', '"JetBrains Mono",ui-monospace,monospace', 'Regular · Bold'],
  ['Courier New', '"Courier New",monospace', 'Regular · Bold'],
  ['Impact', 'Impact,sans-serif', 'Regular']
] as const;

const SIZES = [42, 30, 22, 17, 13, 11] as const;

/** 字体册：左侧选字体族，右侧显示大字样与六个字号的示例句。 */
@Component({
  selector: 'app-font-book',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './font-book.html'
})
export class FontBookApp {
  protected readonly fonts = FONTS;
  protected readonly sizes = SIZES;
  protected readonly selected = signal(0);
  protected readonly current = computed(() => FONTS[this.selected()]);

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('fontbook')));
  }
}
