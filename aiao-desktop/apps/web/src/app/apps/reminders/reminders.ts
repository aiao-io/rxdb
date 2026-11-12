import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChildren
} from '@angular/core';

import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';

/** 侧栏清单：[名称, 颜色, 数量]。数量是写死的，勾选提醒不会改它。 */
const LISTS = [
  ['Today', '#0a84ff', 3],
  ['Scheduled', '#ff375f', 5],
  ['All', '#1d1d1f', 11],
  ['Flagged', '#ff9f0a', 2],
  ['Completed', '#8e8e93', 24]
] as const;

/** 点圆圈勾选时统一染成强调蓝，与提醒原来的颜色无关。 */
const DONE_TINT = '#0a84ff';

/** [标题, 时间, 已完成, 完成色] */
const SEED = [
  ['Send design review feedback', 'Today 5:00 PM', false, '#ff375f'],
  ['Review PR #142 — column view sizing', 'Today 6:30 PM', false, '#0a84ff'],
  ['Pick up dry cleaning', 'Today', false, '#ff9f0a'],
  ['Book the car for Saturday', 'Tomorrow', false, '#0a84ff'],
  ['Reply to Anna about the tray blur', 'Tomorrow 9:00 AM', false, '#30d158'],
  ['Fix unfocused window shadows', 'Done', true, '#8e8e93'],
  ['Write the neofetch ASCII by hand', 'Done', true, '#8e8e93']
] as const;

interface Reminder {
  readonly id: number;
  readonly title: string;
  readonly when: string;
  readonly done: boolean;
  /** 完成后圆圈的颜色。 */
  readonly tint: string;
  /** 「+」新建的行：标题直接写在 contenteditable 里，Angular 不接管它的文字。 */
  readonly fresh: boolean;
  readonly editing: boolean;
}

/** 提醒事项：「+」插入一行可直接输入的空白提醒，点一行切换完成。 */
@Component({
  selector: 'app-reminders',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './reminders.html'
})
export class RemindersApp {
  private readonly injector = inject(Injector);
  private readonly drafts = viewChildren<ElementRef<HTMLElement>>('draft');
  private seq = SEED.length;

  protected readonly lists = LISTS;
  protected readonly items = signal<readonly Reminder[]>(
    SEED.map(([title, when, done, tint], id): Reminder => ({
      id,
      title,
      when,
      done,
      tint,
      fresh: false,
      editing: false
    }))
  );

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('reminders')));
  }

  protected add(): void {
    const item: Reminder = {
      id: this.seq++,
      title: '',
      when: 'Today',
      done: false,
      tint: DONE_TINT,
      fresh: true,
      editing: true
    };
    this.items.update(list => [item, ...list]);
    /* 新行总是排在最前，等它渲染出来再聚焦。 */
    afterNextRender(() => this.drafts().at(0)?.nativeElement.focus(), { injector: this.injector });
  }

  protected toggle(item: Reminder): void {
    this.patch(item, entry => (entry.done ? { ...entry, done: false } : { ...entry, done: true, tint: DONE_TINT }));
  }

  /** 失焦：空行直接丢掉，有内容就锁定成普通提醒。 */
  protected commit(item: Reminder, text: string | null): void {
    if (text?.trim()) this.patch(item, entry => ({ ...entry, editing: false }));
    else this.items.update(list => list.filter(entry => entry.id !== item.id));
  }

  /** 回车即提交，不插入换行。 */
  protected finish(event: Event, field: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    field.blur();
  }

  private patch(item: Reminder, change: (entry: Reminder) => Reminder): void {
    this.items.update(list => list.map(entry => (entry.id === item.id ? change(entry) : entry)));
  }
}
