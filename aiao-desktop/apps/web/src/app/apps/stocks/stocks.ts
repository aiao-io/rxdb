import { Component, computed, inject, signal } from '@angular/core';

import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { Sparkline } from '../../shared/status-glyphs';
import { TrafficLights } from '../../shared/traffic-lights';
import { toTicker } from './stocks-data';
import { WatchlistSymbol } from './stocks.entities';

/** 时间范围按钮与折线的颠簸步数：窗口越长走势越平滑，一天则很毛躁。 */
const RANGES = [
  ['1D', 26],
  ['1W', 40],
  ['1M', 60],
  ['3M', 80],
  ['6M', 100],
  ['YTD', 120],
  ['1Y', 140],
  ['2Y', 170],
  ['5Y', 200],
  ['10Y', 240]
] as const;

type Range = (typeof RANGES)[number][0];

/** 股票：左侧自选列表，右侧行情详情；切换时间范围会重画走势。自选列表来自本地库，所有窗口共用。 */
@Component({
  selector: 'app-stocks',
  imports: [Icon, Sparkline, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './stocks.html'
})
export class StocksApp {
  private readonly watchlist = liveQuery(
    () => WatchlistSymbol.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    WatchlistSymbol
  );

  protected readonly ranges = RANGES;
  protected readonly selected = signal(0);
  protected readonly range = signal<Range>('1M');

  protected readonly tickers = computed(() => this.watchlist().map(toTicker));
  /** 选中的那支；自选列表还没读到时为 `undefined`。 */
  protected readonly current = computed(() => this.tickers().at(this.selected()));
  protected readonly rangeIndex = computed(() => RANGES.findIndex(([label]) => label === this.range()));
  protected readonly steps = computed(() => RANGES[this.rangeIndex()][1]);
  /** 种子随股票与范围变化，所以换范围时走势真的会换一条。 */
  protected readonly seed = computed(() => this.selected() + 3 + this.rangeIndex() * 5);
  /** 详情区要显示的内容：涨跌幅文字与八格数据。 */
  protected readonly detail = computed(() => {
    const quote = this.current();
    if (!quote) return null;
    const { p, d } = quote;
    /* 「Open」沿用旧实现：现价减去涨跌幅百分比，并不是真正的开盘价。 */
    const stats = [
      ['Open', (p - d).toFixed(2)],
      ['High', (p * 1.014).toFixed(2)],
      ['Low', (p * 0.986).toFixed(2)],
      ['Vol', '58.2M'],
      ['P/E', '34.2'],
      ['Mkt Cap', '3.48T'],
      ['52W H', (p * 1.22).toFixed(2)],
      ['52W L', (p * 0.72).toFixed(2)]
    ] as const;
    return { quote, change: Math.abs(d).toFixed(2), stats };
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('stocks')));
  }
}
