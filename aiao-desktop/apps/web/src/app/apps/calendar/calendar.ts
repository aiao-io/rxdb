import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';

import { CalendarEvent, CalendarEventDraft, CalendarStore, eventTime } from '../../services/calendar-store';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { DAYS, DAYS3, MONS, MONS3, clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { CalendarEventEditor } from './calendar-event-editor';
import {
  CalendarView,
  EventDate,
  FIRST_HOUR,
  HOURS,
  HOUR_ROW,
  MonthCell,
  hourLabel,
  layoutDay,
  miniMonth,
  monthCells,
  viewTitle,
  weekOf
} from './calendar-model';

/** 月视图与全天横条里的事件条。 */
interface ChipView {
  readonly id: string;
  readonly title: string;
  readonly color: string;
  readonly allDay: boolean;
  readonly tip: string;
}

interface CellView extends MonthCell {
  readonly key: string;
  readonly today: boolean;
  readonly chips: readonly ChipView[];
  readonly more: number;
}

interface PlacedView {
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  readonly color: string;
  readonly top: number;
  readonly height: number;
  readonly x: number;
  readonly w: number;
}

/** 日、周视图里的一列。 */
interface ColumnView {
  readonly key: string;
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly today: boolean;
  readonly short: string;
  readonly long: string;
  readonly placed: readonly PlacedView[];
  /** 红色“现在”线的位置；不是今天时为 `null`。 */
  readonly nowTop: number | null;
}

/** 打开编辑器时点中的位置，缺省的字段取窗口当前显示的日期。 */
interface EditorSeed {
  readonly y?: number;
  readonly m?: number;
  readonly d?: number;
  readonly s?: number;
}

interface PointerDrag {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  live: boolean;
}

const VIEWS = [
  { view: 'day', label: 'Day', width: 38 },
  { view: 'week', label: 'Week', width: 42 },
  { view: 'month', label: 'Month', width: 46 },
  { view: 'year', label: 'Year', width: 38 }
] as const;

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** 日历：日、周、月、年四种视图，事件来自共享的日历存储；每个窗口各自记着翻到哪一天。 */
@Component({
  selector: 'app-calendar',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './calendar.html'
})
export class CalendarApp {
  private readonly win = inject(DesktopWindow);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly frame = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly days = computed(() =>
    this.view() === 'week' ?
      weekOf(this.year(), this.month(), this.day())
    : [new Date(this.year(), this.month(), this.day() || 1)]
  );
  private readonly start = new Date();
  private drag: PointerDrag | null = null;
  private dragAbort: AbortController | null = null;

  protected readonly store = inject(CalendarStore);
  protected readonly views = VIEWS;
  protected readonly letters = LETTERS;
  protected readonly days3 = DAYS3;
  protected readonly hours = HOURS.map(hour => ({ hour, label: hourLabel(hour) }));
  protected readonly rowHeight = HOUR_ROW;
  protected readonly view = signal<CalendarView>('month');
  protected readonly year = signal(this.start.getFullYear());
  protected readonly month = signal(this.start.getMonth());
  protected readonly day = signal(this.start.getDate());
  /** 点过的格子；样式上没有区别，只是和原版一样留个标记。 */
  protected readonly picked = signal<string | null>(null);
  protected readonly dragging = signal<string | null>(null);
  protected readonly dropKey = signal<string | null>(null);

  protected readonly heading = computed(() => viewTitle(this.view(), this.year(), this.month(), this.day()));
  protected readonly mini = computed(() => miniMonth(this.year(), this.month(), new Date()));
  protected readonly upcoming = computed(() =>
    this.store.upcoming(new Date(), 4).map(event => ({
      id: event.id,
      title: event.t,
      color: this.store.colorOf(event),
      when: `${MONS3[event.d[1]]} ${event.d[2]} · ${eventTime(event)}`
    }))
  );
  protected readonly cells = computed<readonly CellView[]>(() => {
    const now = new Date();
    return monthCells(this.year(), this.month()).map(cell => {
      const events = this.store.on(cell.y, cell.m, cell.d);
      const today = !cell.out && cell.d === now.getDate() && cell.m === now.getMonth() && cell.y === now.getFullYear();
      return {
        ...cell,
        key: `${cell.y}-${cell.m}-${cell.d}`,
        today,
        chips: events.slice(0, 3).map(event => this.chip(event)),
        more: events.length - 3
      };
    });
  });
  protected readonly months = computed(() => {
    const y = this.year();
    const now = new Date();
    return MONS.map((name, index) => {
      const dim = new Date(y, index + 1, 0).getDate();
      return {
        name,
        index,
        blanks: Array.from({ length: new Date(y, index, 1).getDay() }, (_, blank) => blank),
        days: Array.from({ length: dim }, (_, offset) => {
          const d = offset + 1;
          return {
            text: String(d),
            today: d === now.getDate() && index === now.getMonth() && y === now.getFullYear(),
            has: this.store.on(y, index, d).length > 0
          };
        })
      };
    });
  });
  protected readonly columns = computed<readonly ColumnView[]>(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return this.days().map(date => {
      const today = date.toDateString() === now.toDateString();
      const events = this.store.on(date.getFullYear(), date.getMonth(), date.getDate());
      return {
        key: date.toDateString(),
        y: date.getFullYear(),
        m: date.getMonth(),
        d: date.getDate(),
        today,
        short: `${DAYS3[date.getDay()]} ${date.getDate()}`,
        long: `${DAYS[date.getDay()]} ${date.getDate()}`,
        placed: layoutDay(events).map(({ event, x, w }) => this.placed(event, x, w)),
        nowTop: today ? (nowMinutes / 60 - FIRST_HOUR) * HOUR_ROW : null
      };
    });
  });
  /** 全天事件的横条：每天一格，没有全天事件的日子也要留格子保持对齐。 */
  protected readonly band = computed(() =>
    this.days().map(date =>
      this.store
        .on(date.getFullYear(), date.getMonth(), date.getDate())
        .filter(event => event.s === null)
        .map(event => this.chip(event))
    )
  );
  protected readonly hasBand = computed(() => this.band().some(cell => cell.length > 0));

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('calendar', {
          View: [
            { id: 'd', label: 'Day', key: '⌘1' },
            { id: 'w', label: 'Week', key: '⌘2' },
            { id: 'm', label: 'Month', key: '⌘3', checked: true },
            { id: 'y', label: 'Year', key: '⌘4' },
            '-',
            { id: 't', label: 'Go to Today', key: '⌘T', run: () => this.goToday() }
          ]
        })
      )
    );
    this.destroyRef.onDestroy(() => this.stopDrag());
  }

  /** 箭头按当前视图的跨度翻页。 */
  protected shift(delta: number): void {
    const view = this.view();
    if (view === 'year') this.year.update(year => year + delta);
    else if (view === 'month') {
      const month = this.month() + delta;
      this.year.update(year => year + Math.floor(month / 12));
      this.month.set(((month % 12) + 12) % 12);
    } else {
      const base = new Date(this.year(), this.month(), this.day() || 1);
      base.setDate(base.getDate() + delta * (view === 'week' ? 7 : 1));
      this.year.set(base.getFullYear());
      this.month.set(base.getMonth());
      this.day.set(base.getDate());
    }
    this.render();
  }

  protected goToday(): void {
    const now = new Date();
    this.year.set(now.getFullYear());
    this.month.set(now.getMonth());
    this.day.set(now.getDate());
    this.render();
  }

  protected setView(view: CalendarView): void {
    this.view.set(view);
    this.render();
  }

  /** 年视图里的某个月：点一下进入那个月。 */
  protected openMonth(index: number): void {
    this.month.set(index);
    this.setView('month');
  }

  protected async toggle(id: string): Promise<void> {
    await this.store.toggleCalendar(id);
    this.render();
  }

  protected pick(cell: CellView): void {
    if (cell.out) return;
    this.picked.set(cell.key);
    this.day.set(cell.d);
  }

  protected newEvent(): void {
    this.openEditor(null, { y: this.year(), m: this.month(), d: this.day() || 1 });
  }

  protected edit(id: string): void {
    const event = this.store.events().find(item => item.id === id);
    if (event) this.openEditor(event, {});
  }

  /** 和 Calendar.app 一样：在某天的空白处双击就新建。 */
  protected createOn(event: MouseEvent, cell: CellView): void {
    if (cell.out || (event.target as Element).closest('.cal-ev')) return;
    this.openEditor(null, { y: cell.y, m: cell.m, d: cell.d });
  }

  /** 双击某个小时行，编辑器直接带着那个时刻（对齐到 15 分钟）。 */
  protected createAt(event: MouseEvent, column: ColumnView): void {
    if ((event.target as Element).closest('.ev')) return;
    const top = (event.currentTarget as HTMLElement).getBoundingClientRect().top;
    const minutes = FIRST_HOUR * 60 + Math.round((((event.clientY - top) / HOUR_ROW) * 60) / 15) * 15;
    this.openEditor(null, { y: column.y, m: column.m, d: column.d, s: clamp(minutes, 0, 1425) });
  }

  /** 把事件条拖到另一天就是改期；窗口级的指针监听只在拖动期间挂着。 */
  protected dragStart(event: PointerEvent, id: string): void {
    if (event.button) return;
    this.stopDrag();
    this.drag = { id, x: event.clientX, y: event.clientY, live: false };
    this.dragAbort = new AbortController();
    const { signal } = this.dragAbort;
    addEventListener('pointermove', (move: PointerEvent) => this.dragMove(move), { signal });
    addEventListener('pointerup', (up: PointerEvent) => this.dragEnd(up), { signal });
  }

  /** 原版每次重绘都会把时间轴滚回起始小时；这里等新的 DOM 渲染出来再对齐。 */
  private render(): void {
    afterNextRender(() => this.scrollToHour(), { injector: this.injector });
  }

  /** 时间轴默认停在 7 点；看今天时跟着时钟走（当前时刻前两小时，夹在 7 点到 16 点之间），半夜来访也不会落在一片空白里。 */
  private scrollToHour(): void {
    const scroller = this.scroller()?.nativeElement;
    if (!scroller) return;
    const now = new Date();
    const shown = new Date(this.year(), this.month(), this.day() || 1);
    const anchor = shown.toDateString() === now.toDateString() ? clamp(now.getHours() - 2, 7, 16) : 7;
    scroller.scrollTop = (anchor - FIRST_HOUR) * HOUR_ROW;
  }

  private chip(event: CalendarEvent): ChipView {
    return {
      id: event.id,
      title: event.t,
      color: this.store.colorOf(event),
      allDay: event.s === null,
      tip: `${event.t} · ${eventTime(event)}`
    };
  }

  private placed(event: CalendarEvent, x: number, w: number): PlacedView {
    return {
      id: event.id,
      title: event.t,
      sub: `${eventTime(event)}${event.loc ? ` · ${event.loc}` : ''}`,
      color: this.store.colorOf(event),
      top: ((event.s ?? 0) / 60 - FIRST_HOUR) * HOUR_ROW,
      height: Math.max(17, ((event.dur || 60) / 60) * HOUR_ROW - 2),
      x,
      w
    };
  }

  /** 新建与编辑共用一个编辑器；保存后窗口跳到事件所在的那一天。 */
  private openEditor(event: CalendarEvent | null, seed: EditorSeed): void {
    const hour = new Date().getHours();
    const draft: CalendarEventDraft = event ?? {
      d: [seed.y ?? this.year(), seed.m ?? this.month(), seed.d ?? (this.day() || 1)],
      t: '',
      s: seed.s ?? Math.min(1380, (hour + 1) * 60),
      dur: 60,
      cal: 'work',
      loc: '',
      notes: ''
    };
    const rect = (this.frame.nativeElement.closest('.win') ?? this.frame.nativeElement).getBoundingClientRect();
    this.popover.openComponent(
      CalendarEventEditor,
      { x: Math.min(rect.right - 356, innerWidth - 356), y: rect.top + 64, origin: 'top right' },
      { event, draft, done: (saved: EventDate | null) => this.afterEdit(saved) }
    );
  }

  private afterEdit(saved: EventDate | null): void {
    /* 编辑器是全局弹出层，不随窗口一起关闭；窗口已经没了就只保存事件，不再动视图。 */
    if (this.destroyRef.destroyed) return;
    if (saved) {
      this.year.set(saved[0]);
      this.month.set(saved[1]);
      this.day.set(saved[2]);
    }
    this.render();
  }

  private dragMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    if (!drag.live) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.live = true;
      this.dragging.set(drag.id);
      document.body.style.cursor = 'grabbing';
    }
    const target = this.cellAt(event.clientX, event.clientY);
    this.dropKey.set(target ? target.join('-') : null);
  }

  private async dragEnd(event: PointerEvent): Promise<void> {
    const drag = this.drag;
    this.stopDrag();
    if (!drag?.live) return;
    const target = this.cellAt(event.clientX, event.clientY);
    const moved = this.store.events().find(item => item.id === drag.id);
    if (!target || !moved || target.join() === moved.d.join()) return;
    await this.store.update(drag.id, { d: target });
    this.render();
    this.toast.show(`Moved to ${MONS3[target[1]]} ${target[2]}`);
  }

  private stopDrag(): void {
    this.dragAbort?.abort();
    this.dragAbort = null;
    this.drag = null;
    this.dragging.set(null);
    this.dropKey.set(null);
    document.body.style.cursor = '';
  }

  /** 指针下方的非补位日期格；没有则为 `null`。 */
  private cellAt(x: number, y: number): EventDate | null {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cal-cell:not(.out)');
    return cell ? [Number(cell.dataset['y']), Number(cell.dataset['m']), Number(cell.dataset['d'])] : null;
  }
}
