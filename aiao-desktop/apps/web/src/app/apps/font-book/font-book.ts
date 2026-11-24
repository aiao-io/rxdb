import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { Preferences } from '../../data/preferences';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { Slider } from '../../shared/slider';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  FONT_COLLECTIONS,
  FontCollection,
  filterByCollection,
  filterFontFamilies,
  isStringList,
  previewScale,
  recordRecentFont,
  scaleSizes,
  toggleName,
  type FontFamilySummary
} from './font-book-data';
import { FontFamily } from './font-book.entities';

const SIZES = [42, 30, 22, 17, 13, 11] as const;

/** 收藏 / 最近使用 / 停用名单的偏好键。 */
const FAVOURITES_KEY = 'fontbook:favourites';
const RECENT_KEY = 'fontbook:recent';
const DISABLED_KEY = 'fontbook:disabled';

/**
 * 字体册：左侧集合（全部/收藏/最近使用）与字体族列表，右侧大字样与可调字号的示例句。
 * 字号滑杆缩放预览；字体可停用（名单存偏好，列表里灰显）。
 */
@Component({
  selector: 'app-font-book',
  imports: [Icon, TrafficLights, Slider],
  host: { style: 'display: contents' },
  templateUrl: './font-book.html'
})
export class FontBookApp {
  private readonly preferences = inject(Preferences);
  private readonly families = liveQuery(
    () => FontFamily.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    FontFamily
  );
  private readonly favouritesState = signal<readonly string[]>([]);
  private readonly recentState = signal<readonly string[]>([]);
  private readonly disabledState = signal<readonly string[]>([]);
  private readonly restored = signal(false);

  protected readonly collections = FONT_COLLECTIONS;
  protected readonly sizes = SIZES;
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly collection = signal<FontCollection>('all');
  /** 预览字号滑杆（0..1），默认对应 1.0 倍率。 */
  protected readonly previewFraction = signal(1 / 3);
  protected readonly fonts = computed(() =>
    this.families().map(({ name, stack, styles }) => ({ name, stack, styles }))
  );
  protected readonly visibleFonts = computed(() => {
    const fonts = filterByCollection(this.fonts(), this.collection(), this.favouritesState(), this.recentState());
    return filterFontFamilies(fonts, this.query());
  });
  /** 每个集合的数量。 */
  protected readonly collectionCounts = computed(() => ({
    all: this.fonts().length,
    favourites: filterByCollection(this.fonts(), 'favourites', this.favouritesState(), this.recentState()).length,
    recent: filterByCollection(this.fonts(), 'recent', this.favouritesState(), this.recentState()).length
  }));
  /** 选中的字体族；筛选后原选中项消失就显示第一支。 */
  protected readonly current = computed<FontFamilySummary | undefined>(() => {
    const fonts = this.visibleFonts();
    return fonts.find(font => font.name === this.selected()) ?? fonts[0] ?? undefined;
  });
  protected readonly factor = computed(() => previewScale(this.previewFraction()));
  /** 大字样的字号（默认 64px 按倍率缩放）。 */
  protected readonly previewPx = computed(() => Math.round(64 * this.factor()));
  /** 示例句的字号档位按倍率缩放。 */
  protected readonly sampleSizes = computed(() => scaleSizes(SIZES, this.factor()));

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('fontbook')));
    /* 启动时恢复收藏 / 最近使用 / 停用名单；之后每次改动写回偏好。 */
    this.preferences.ready.then(
      () => {
        this.adopt(FAVOURITES_KEY, this.favouritesState);
        this.adopt(RECENT_KEY, this.recentState);
        this.adopt(DISABLED_KEY, this.disabledState);
        this.restored.set(true);
      },
      () => undefined
    );
    effect(() => {
      const favourites = this.favouritesState();
      if (!this.restored()) return;
      untracked(() => void this.preferences.set(FAVOURITES_KEY, favourites).catch(() => undefined));
    });
    effect(() => {
      const recent = this.recentState();
      if (!this.restored()) return;
      untracked(() => void this.preferences.set(RECENT_KEY, recent).catch(() => undefined));
    });
    effect(() => {
      const disabled = this.disabledState();
      if (!this.restored()) return;
      untracked(() => void this.preferences.set(DISABLED_KEY, disabled).catch(() => undefined));
    });
  }

  /** 点字体族：选中并记进最近使用。 */
  protected selectFont(name: string): void {
    this.selected.set(name);
    this.recentState.update(recent => recordRecentFont(recent, name));
  }

  protected setCollection(collection: FontCollection): void {
    this.collection.set(collection);
  }

  protected isDisabled(name: string): boolean {
    return this.disabledState().includes(name);
  }

  protected disabledLabel(name: string): string {
    return this.isDisabled(name) ? 'Enable “' + name + '”' : 'Disable “' + name + '”';
  }

  protected toggleFont(name: string): void {
    this.disabledState.update(disabled => toggleName(disabled, name));
  }

  private adopt(key: string, target: { set(value: readonly string[]): void }): void {
    const saved = this.preferences.get(key, isStringList);
    if (saved) target.set(saved);
  }
}
