import { Component, computed, inject, signal } from '@angular/core';

import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { filterFontFamilies, type FontFamilySummary } from './font-book-data';
import { FontFamily } from './font-book.entities';

const SIZES = [42, 30, 22, 17, 13, 11] as const;

/** 字体册：左侧选字体族（来自本地库的字体目录），右侧显示大字样与六个字号的示例句。 */
@Component({
  selector: 'app-font-book',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './font-book.html'
})
export class FontBookApp {
  private readonly families = liveQuery(
    () => FontFamily.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    FontFamily
  );

  protected readonly sizes = SIZES;
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly fonts = computed(() =>
    this.families().map(({ name, stack, styles }) => ({ name, stack, styles }))
  );
  protected readonly visibleFonts = computed(() => filterFontFamilies(this.fonts(), this.query()));
  /** 选中的字体族；筛选后原选中项消失就显示第一支。 */
  protected readonly current = computed<FontFamilySummary | undefined>(() => {
    const fonts = this.visibleFonts();
    return fonts.find(font => font.name === this.selected()) ?? fonts[0] ?? undefined;
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('fontbook')));
  }
}
