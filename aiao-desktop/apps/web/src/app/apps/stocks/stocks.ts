import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { Sparkline } from '../../shared/status-glyphs';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  filterTickers,
  moveIndex,
  nextWatchPosition,
  normalizeSymbol,
  reorderPositions,
  tickerOf,
  toTicker,
  type Ticker
} from './stocks-data';
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
  private readonly data = inject(DesktopData);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listBox = viewChild<ElementRef<HTMLElement>>('listBox');
  private readonly watchlist = liveQuery(
    () => WatchlistSymbol.findAll({ where: ALL_ROWS, orderBy: [{ field: 'position', sort: 'asc' }] }),
    [],
    WatchlistSymbol
  );
  private dragAbort: AbortController | null = null;

  protected readonly ranges = RANGES;
  protected readonly selected = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly range = signal<Range>('1M');

  protected readonly tickers = computed(() => this.watchlist().map(toTicker));
  protected readonly visibleTickers = computed(() => filterTickers(this.tickers(), this.query()));
  /** 选中的那支；筛选后原选中项消失就显示第一支。 */
  protected readonly current = computed<Ticker | undefined>(() => {
    const tickers = this.visibleTickers();
    return tickers.find(ticker => ticker.s === this.selected()) ?? tickers[0] ?? undefined;
  });
  protected readonly selectedIndex = computed(() => {
    const current = this.current();
    return current ? this.visibleTickers().findIndex(ticker => ticker.s === current.s) : 0;
  });
  protected readonly rangeIndex = computed(() => RANGES.findIndex(([label]) => label === this.range()));
  protected readonly steps = computed(() => RANGES[this.rangeIndex()][1]);
  /** 种子随股票与范围变化，所以换范围时走势真的会换一条。 */
  protected readonly seed = computed(() => this.selectedIndex() + 3 + this.rangeIndex() * 5);
  /** 详情区要显示的内容：涨跌幅文字与八格数据。 */
  protected readonly detail = computed(() => {
    const quote = this.current();
    if (!quote) return null;
    const { p, d } = quote;
    /* 「Open」沿用旧实现：现价减去涨跌幅百分比，并不是真正的开盘价。 */
    const stats = [
      ['Open (demo)', (p - d).toFixed(2)],
      ['High (demo)', (p * 1.014).toFixed(2)],
      ['Low (demo)', (p * 0.986).toFixed(2)],
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
    const wm = inject(WindowManager);
    inject(DesktopWindow).setMenus(
      computed(() =>
        menus.standard('stocks', {
          File: [
            { id: 'n', label: 'New Window', key: '⌘N', run: () => wm.open('stocks', { force: true }) },
            { id: 'w', label: 'Close Window', key: '⌘W', run: () => wm.closeFront() },
            '-',
            { id: 'f', label: 'Find', key: '⌘F', run: () => this.focusSearch() }
          ]
        })
      )
    );
  }

  protected focusSearch(): void {
    this.searchField()?.nativeElement.focus();
  }

  /** 把代码加进自选（来自演示目录）；已在列表里就选中它。 */
  protected async addSymbol(input: HTMLInputElement): Promise<void> {
    const symbol = normalizeSymbol(input.value);
    input.value = '';
    if (!symbol) return;
    const existing = this.watchlist().find(row => row.symbol === symbol);
    if (existing) {
      this.selected.set(existing.symbol);
      return;
    }
    const ticker = tickerOf(symbol);
    if (!ticker) {
      this.toast.show(`“${symbol}” is not in the demo catalog.`);
      return;
    }
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(WatchlistSymbol);
      await repository.create(
        this.data.instantiate(WatchlistSymbol, {
          symbol: ticker.s,
          name: ticker.n,
          price: ticker.p,
          changePercent: ticker.d,
          position: nextWatchPosition(this.watchlist().map(row => row.position))
        })
      );
    });
    this.selected.set(symbol);
  }

  protected rowMenu(event: MouseEvent, ticker: Ticker): void {
    event.preventDefault();
    event.stopPropagation();
    this.popover.contextMenu(
      event,
      [
        { id: 'sel', label: 'Show ' + ticker.s, run: () => this.selected.set(ticker.s) },
        '-',
        { id: 'rm', label: 'Remove from Watchlist', run: () => void this.removeSymbol(ticker.s) }
      ],
      'Stock actions'
    );
  }

  /** 方向键在自选列表里移动选中并保持焦点跟着走。 */
  protected rowKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = moveIndex(index, event.key === 'ArrowUp' ? -1 : 1, this.visibleTickers().length);
    const ticker = this.visibleTickers()[next];
    if (!ticker) return;
    this.selected.set(ticker.s);
    (this.listBox()?.nativeElement.querySelector(`[data-ti="${next}"]`) as HTMLElement | null)?.focus();
  }

  /** 拖动排序：松手时把该行移到指针下的位置，写回库。 */
  protected dragStart(event: PointerEvent, index: number): void {
    if (event.button) return;
    if ((event.target as Element).closest('button, input')) return;
    this.dragAbort?.abort();
    this.dragAbort = new AbortController();
    const { signal } = this.dragAbort;
    addEventListener('pointerup', (up: PointerEvent) => this.dragEnd(up, index), { signal });
  }

  private dragEnd(event: PointerEvent, from: number): void {
    this.dragAbort?.abort();
    this.dragAbort = null;
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const target = element?.closest('[data-ti]')?.getAttribute('data-ti');
    if (target === null || target === undefined) return;
    const to = Number(target);
    if (!Number.isInteger(to) || to === from) return;
    const rows = this.watchlist();
    const positions = reorderPositions(rows, from, to);
    void this.data.transaction(async executor => {
      const repository = executor.getRepository(WatchlistSymbol);
      for (const row of rows) {
        const position = positions.get(row.symbol);
        if (position !== undefined && position !== row.position) await repository.update(row, { position });
      }
    });
  }

  private async removeSymbol(symbol: string): Promise<void> {
    const row = this.watchlist().find(entry => entry.symbol === symbol);
    if (!row) return;
    await this.data.transaction(async executor => {
      await executor.getRepository(WatchlistSymbol).remove(row);
    });
    if (this.selected() === symbol) this.selected.set(null);
  }
}
