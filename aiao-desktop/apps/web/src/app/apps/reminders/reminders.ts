import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChildren
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import {
  DONE_TINT,
  NEW_REMINDER_DUE,
  ReminderDraft,
  ReminderRow,
  draftRow,
  nextPosition,
  rowOf,
  togglePatch
} from './reminders-model';
import { Reminder } from './reminders.entities';

/** 侧栏清单：[名称, 颜色, 数量]。数量是写死的，勾选提醒不会改它。 */
const LISTS = [
  ['Today', '#0a84ff', 3],
  ['Scheduled', '#ff375f', 5],
  ['All', '#1d1d1f', 11],
  ['Flagged', '#ff9f0a', 2],
  ['Completed', '#8e8e93', 24]
] as const;

/**
 * 提醒事项：提醒存在桌面库里，所有窗口共用；「+」插入一行可直接输入的空白草稿，
 * 输入完成（失焦且有内容）才写进库，点一行切换完成。
 */
@Component({
  selector: 'app-reminders',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './reminders.html'
})
export class RemindersApp {
  private readonly injector = inject(Injector);
  private readonly data = inject(DesktopData);
  private readonly fields = viewChildren<ElementRef<HTMLElement>>('draft');
  private readonly reminders = liveQuery(
    () =>
      Reminder.findAll({
        where: ALL_ROWS,
        orderBy: [
          { field: 'position', sort: 'asc' },
          { field: 'createdAt', sort: 'desc' }
        ]
      }),
    [],
    Reminder
  );
  private readonly drafts = signal<readonly ReminderDraft[]>([]);
  private seq = 0;

  protected readonly lists = LISTS;
  /** 草稿排在最前（新建的总在最上），其后是库里的提醒；已经写进库的草稿不再显示。 */
  protected readonly items = computed<readonly ReminderRow[]>(() => {
    const known = new Set<string>(this.reminders().map(reminder => reminder.id));
    const open = this.drafts().filter(draft => draft.createdId === null || !known.has(draft.createdId));
    return [...open.map(draftRow), ...this.reminders().map(rowOf)];
  });

  constructor() {
    const menus = inject(DesktopMenus);
    inject(DesktopWindow).setMenus(computed(() => menus.standard('reminders')));
    /* 活查询已经带回来的草稿不必再留着。 */
    effect(() => {
      const known = new Set<string>(this.reminders().map(reminder => reminder.id));
      const settled = this.drafts().filter(draft => draft.createdId !== null && known.has(draft.createdId));
      if (settled.length) untracked(() => this.drafts.update(list => list.filter(draft => !settled.includes(draft))));
    });
  }

  protected add(): void {
    const draft: ReminderDraft = { id: `draft-${++this.seq}`, done: false, editing: true, title: '', createdId: null };
    this.drafts.update(list => [draft, ...list]);
    /* 新行总是排在最前，等它渲染出来再聚焦。 */
    afterNextRender(() => this.fields().at(0)?.nativeElement.focus(), { injector: this.injector });
  }

  /** 草稿行只在输入时可以勾（和原来一样）；库里的提醒写回 `done`（以及完成色）。 */
  protected async toggle(item: ReminderRow): Promise<void> {
    if (item.fresh) {
      if (item.editing) this.patchDraft(item.id, draft => ({ ...draft, done: !draft.done }));
      return;
    }
    const repository = await this.data.repository(Reminder);
    await repository.update(this.reminder(item.id), togglePatch(item));
  }

  /** 失焦：空行直接丢掉，有内容就锁定成普通提醒并写进库。 */
  protected async commit(item: ReminderRow, text: string | null): Promise<void> {
    const draft = this.drafts().find(entry => entry.id === item.id);
    if (!draft?.editing) return;
    const title = text?.trim() ?? '';
    if (!title) {
      this.drafts.update(list => list.filter(entry => entry !== draft));
      return;
    }
    const reminder = this.data.instantiate(Reminder, {
      title,
      due: NEW_REMINDER_DUE,
      done: draft.done,
      tint: DONE_TINT,
      position: nextPosition(this.reminders().map(entry => entry.position))
    });
    /* 先锁定草稿并记下新行的 id：写入期间草稿行继续显示打下的字，活查询把这一行带回来的同一刻再让位。 */
    this.patchDraft(draft.id, entry => ({ ...entry, editing: false, title, createdId: reminder.id }));
    try {
      await (await this.data.repository(Reminder)).create(reminder);
    } catch (error) {
      /* 没写成：撤掉这行草稿，别让界面上留一条库里没有的提醒；错误照常抛出。 */
      this.drafts.update(list => list.filter(entry => entry.id !== draft.id));
      throw error;
    }
  }

  /** 回车即提交，不插入换行。 */
  protected finish(event: Event, field: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    field.blur();
  }

  private reminder(id: string): Reminder {
    const reminder = this.reminders().find(entry => entry.id === id);
    if (!reminder) throw new Error(`Reminder not found: ${id}`);
    return reminder;
  }

  private patchDraft(id: string, change: (draft: ReminderDraft) => ReminderDraft): void {
    this.drafts.update(list => list.map(draft => (draft.id === id ? change(draft) : draft)));
  }
}
