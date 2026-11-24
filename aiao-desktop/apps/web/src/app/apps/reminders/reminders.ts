import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { PopoverService } from '../../services/popover';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { ReminderDrafts, ReminderWrite, reminderFailureMessage } from './reminder-drafts';
import { ReminderDeletePanel } from './reminders-confirm';
import { ReminderDuePanel } from './reminders-due-panel';
import {
  DONE_TINT,
  REMINDER_LISTS,
  ReminderList,
  ReminderRow,
  applyList,
  draftRow,
  filterReminders,
  reminderListCount,
  reminderMatchesList,
  rowOf,
  togglePatch
} from './reminders-model';
import { Reminder } from './reminders.entities';

@Component({
  selector: 'app-reminders',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './reminders.html'
})
export class RemindersApp {
  private readonly injector = inject(Injector);
  private readonly data = inject(DesktopData);
  private readonly wm = inject(WindowManager);
  private readonly popover = inject(PopoverService);
  private readonly fields = viewChildren<ElementRef<HTMLInputElement>>('draft');
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('rsearch');
  private readonly writes = new Map<string, Promise<void>>();
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
  private readonly allItems = computed<readonly ReminderRow[]>(() => {
    const known = new Set<string>(this.reminders().map(reminder => reminder.id));
    const open = this.drafts.rows().filter(draft => draft.createdId === null || !known.has(draft.createdId));
    return [...open.map(draftRow), ...this.reminders().map(rowOf)];
  });
  private dragAbort: AbortController | null = null;
  /** 拖动期间悬停的侧栏列表；只有指针真的在列表项上时才有值。 */
  private readonly hoverList = signal<ReminderList | null>(null);

  protected readonly win = inject(DesktopWindow);
  protected readonly drafts = new ReminderDrafts(draft => this.writeDraft(draft));
  protected readonly selectedList = signal<ReminderList>('today');
  protected readonly query = signal('');
  protected readonly listTitle = computed(
    () => REMINDER_LISTS.find(list => list.id === this.selectedList())?.name ?? 'Today'
  );
  protected readonly lists = computed(() =>
    REMINDER_LISTS.map(list => ({ ...list, count: reminderListCount(this.reminders(), list.id) }))
  );
  protected readonly toggling = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal('');
  protected readonly items = computed<readonly ReminderRow[]>(() => {
    const list = this.selectedList();
    const rows = this.allItems().filter(item => (item.fresh ? list === 'today' : reminderMatchesList(item, list)));
    return filterReminders(rows, this.query());
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(
      computed(() =>
        menus.standard('reminders', {
          File: [
            { id: 'n', label: 'New Reminder', key: '⌘N', run: () => this.add() },
            { id: 'w', label: 'Close Window', key: '⌘W', run: () => this.wm.closeFront() },
            '-',
            { id: 'f', label: 'Find', key: '⌘F', run: () => this.focusSearch() }
          ]
        })
      )
    );
    this.win.confirmClose = async () => {
      await Promise.all(this.writes.values());
      return this.drafts.saveAll();
    };
    effect(() => {
      const known = new Set<string>(this.reminders().map(reminder => reminder.id));
      untracked(() => this.drafts.reconcile(known));
    });
    effect(() => this.win.hasUnsavedChanges.set(this.drafts.dirty() || this.toggling().size > 0));
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (!this.drafts.dirty() && !this.toggling().size) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      this.dragAbort?.abort();
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
      this.drafts.dispose();
    });
  }

  protected selectList(list: ReminderList): void {
    this.selectedList.set(list);
  }

  protected add(): void {
    if (this.win.closePending()) return;
    this.selectedList.set('today');
    this.drafts.add();
    afterNextRender(() => this.fields().at(0)?.nativeElement.focus(), { injector: this.injector });
  }

  protected focusSearch(): void {
    this.searchField()?.nativeElement.focus();
  }

  protected async toggle(item: ReminderRow): Promise<void> {
    if (item.fresh) {
      this.drafts.toggle(item.id);
      return;
    }
    await this.runTracked(item.id, () => this.writeToggle(item.id));
  }

  protected async toggleFlag(item: ReminderRow): Promise<void> {
    if (item.fresh) return;
    await this.runTracked(item.id, () => this.writeFlag(item.id));
  }

  protected leaveDraft(event: FocusEvent, item: ReminderRow): void {
    if (!item.fresh) return;
    const row = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
    void this.drafts.save(item.id);
  }

  protected finish(event: Event, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    void this.drafts.save(id);
  }

  /** 行上按 ⌫ 或 Delete：草稿直接丢弃，库里的先确认；输入框里的退格不触发。 */
  protected rowKey(event: KeyboardEvent, item: ReminderRow): void {
    if ((event.target as Element).closest('input, textarea')) return;
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    event.preventDefault();
    this.requestDelete(item);
  }

  /** 行右键菜单：标旗与删除。 */
  protected rowMenu(event: MouseEvent, item: ReminderRow): void {
    event.preventDefault();
    event.stopPropagation();
    this.popover.contextMenu(
      event,
      [
        ...(item.fresh ?
          []
        : ([{ id: 'f', label: item.flagged ? 'Unflag' : 'Flag', run: () => void this.toggleFlag(item) }] as const)),
        '-',
        { id: 'x', label: item.fresh ? 'Discard Draft' : 'Delete Reminder', run: () => this.requestDelete(item) }
      ],
      'Reminder actions'
    );
  }

  protected requestDelete(item: ReminderRow): void {
    if (item.fresh) {
      this.drafts.discard(item.id);
      return;
    }
    this.openDeleteConfirm(item);
  }

  /** 打开到期日面板；草稿只改草稿，库里的写回实体。 */
  protected openDue(event: Event, item: ReminderRow): void {
    const anchor = event.currentTarget as HTMLElement;
    const rect = anchor.getBoundingClientRect();
    this.popover.openComponent(
      ReminderDuePanel,
      {
        x: Math.min(rect.left, innerWidth - 260),
        y: Math.min(rect.bottom + 4, innerHeight - 300),
        origin: 'top left',
        focus: true,
        onClose: reason => {
          if (reason === 'escape' || reason === 'tab' || reason === 'command') anchor.focus();
        }
      },
      {
        submit: (due: string) => {
          if (item.fresh) this.drafts.setDue(item.id, due);
          else void this.writeDue(item.id, due);
        }
      }
    );
  }

  /** 拖动提醒行到侧栏列表：松手时把语义字段写回库。 */
  protected dragStart(event: PointerEvent, item: ReminderRow): void {
    if (event.button || item.fresh) return;
    if ((event.target as Element).closest('button, input')) return;
    this.dragAbort?.abort();
    this.hoverList.set(null);
    this.dragAbort = new AbortController();
    const { signal } = this.dragAbort;
    addEventListener('pointermove', (move: PointerEvent) => this.dragMove(move), { signal });
    addEventListener('pointerup', (up: PointerEvent) => this.dragEnd(up, item), { signal });
  }

  private dragMove(event: PointerEvent): void {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const list = element?.closest('[data-rlist-drop]')?.getAttribute('data-rlist-drop');
    this.hoverList.set((list as ReminderList | null) ?? null);
  }

  private dragEnd(event: PointerEvent, item: ReminderRow): void {
    const list = this.hoverList();
    this.hoverList.set(null);
    this.dragAbort?.abort();
    this.dragAbort = null;
    if (!list) return;
    const reminder = this.reminders().find(entry => entry.id === item.id);
    if (!reminder) return;
    const patch = applyList(reminder, list);
    if (patch) void this.runTracked(item.id, () => this.writePatch(item.id, patch));
  }

  private async runTracked(id: string, operation: () => Promise<void>): Promise<void> {
    if (this.writes.has(id)) return;
    const write = operation();
    this.writes.set(id, write);
    this.toggling.set(new Set(this.writes.keys()));
    try {
      await write;
    } finally {
      this.writes.delete(id);
      this.toggling.set(new Set(this.writes.keys()));
    }
  }

  private async writeDraft(draft: ReminderWrite): Promise<void> {
    await this.data.ensureSeeded(Reminder);
    await this.data.transaction(async executor => {
      const repository = executor.getRepository(Reminder);
      const [existing] = await repository.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: draft.id }] },
        limit: 1
      });
      if (existing) {
        if (existing.title !== draft.title || existing.done !== draft.done)
          throw new Error('A reminder with this ID has different content. Your draft is still available.');
        return;
      }
      const [first] = await repository.find({
        where: ALL_ROWS,
        orderBy: [{ field: 'position', sort: 'asc' }],
        limit: 1
      });
      await repository.create(
        this.data.instantiate(Reminder, {
          ...draft,
          flagged: false,
          tint: DONE_TINT,
          position: first ? first.position - 1 : 0
        })
      );
    });
  }

  private async writeToggle(id: string): Promise<void> {
    this.error.set('');
    try {
      const repository = await this.data.repository(Reminder);
      const reminder = this.reminders().find(item => item.id === id);
      if (!reminder) throw new Error('This reminder is no longer available.');
      await repository.update(reminder, togglePatch(reminder));
    } catch (error) {
      this.error.set(`Reminder was not updated: ${reminderFailureMessage(error)}`);
    }
  }

  private async writeFlag(id: string): Promise<void> {
    this.error.set('');
    try {
      const repository = await this.data.repository(Reminder);
      const reminder = this.reminders().find(item => item.id === id);
      if (!reminder) throw new Error('This reminder is no longer available.');
      await repository.update(reminder, { flagged: !reminder.flagged });
    } catch (error) {
      this.error.set(`Reminder was not updated: ${reminderFailureMessage(error)}`);
    }
  }

  private async writeDue(id: string, due: string): Promise<void> {
    this.error.set('');
    try {
      const repository = await this.data.repository(Reminder);
      const reminder = this.reminders().find(item => item.id === id);
      if (!reminder) throw new Error('This reminder is no longer available.');
      await repository.update(reminder, { due });
    } catch (error) {
      this.error.set(`Reminder was not updated: ${reminderFailureMessage(error)}`);
    }
  }

  private async writePatch(
    id: string,
    patch: { due?: string; done?: boolean; flagged?: boolean; tint?: string }
  ): Promise<void> {
    this.error.set('');
    try {
      const repository = await this.data.repository(Reminder);
      const reminder = this.reminders().find(item => item.id === id);
      if (!reminder) throw new Error('This reminder is no longer available.');
      await repository.update(reminder, patch);
    } catch (error) {
      this.error.set(`Reminder was not updated: ${reminderFailureMessage(error)}`);
    }
  }

  private async writeRemove(id: string): Promise<void> {
    this.error.set('');
    try {
      const repository = await this.data.repository(Reminder);
      const reminder = this.reminders().find(item => item.id === id);
      if (!reminder) throw new Error('This reminder is no longer available.');
      await repository.remove(reminder);
    } catch (error) {
      this.error.set(`Reminder was not deleted: ${reminderFailureMessage(error)}`);
    }
  }

  private openDeleteConfirm(item: ReminderRow): void {
    const row = this.reminders().find(reminder => reminder.id === item.id);
    const listName = REMINDER_LISTS.find(list => list.id === this.selectedList())?.name ?? 'Today';
    const rect = (document.querySelector(`[data-ri="${item.id}"]`) as HTMLElement | null)?.getBoundingClientRect();
    this.popover.openComponent(
      ReminderDeletePanel,
      {
        x: rect ? Math.min(Math.max(rect.left, 8), innerWidth - 310) : innerWidth / 2 - 150,
        y: rect ? Math.min(rect.bottom + 6, innerHeight - 160) : innerHeight / 2 - 70,
        origin: 'top left',
        focus: true,
        onClose: reason => {
          if (reason === 'escape' || reason === 'tab') {
            (document.querySelector(`[data-ri="${item.id}"]`) as HTMLElement | null)?.focus();
          }
        }
      },
      {
        title: row?.title ?? item.title,
        folder: listName,
        draft: item.fresh,
        remove: () => void this.writeRemove(item.id)
      }
    );
  }
}
