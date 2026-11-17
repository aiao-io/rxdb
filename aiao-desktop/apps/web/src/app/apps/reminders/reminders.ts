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
  viewChildren
} from '@angular/core';

import { DesktopData } from '../../data/desktop-data';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { ReminderDrafts, ReminderWrite, reminderFailureMessage } from './reminder-drafts';
import { DONE_TINT, NEW_REMINDER_DUE, ReminderRow, draftRow, rowOf, togglePatch } from './reminders-model';
import { Reminder } from './reminders.entities';

const LISTS = [
  ['Today', '#0a84ff', 3],
  ['Scheduled', '#ff375f', 5],
  ['All', '#1d1d1f', 11],
  ['Flagged', '#ff9f0a', 2],
  ['Completed', '#8e8e93', 24]
] as const;

@Component({
  selector: 'app-reminders',
  imports: [Icon, TrafficLights],
  host: { style: 'display: contents' },
  templateUrl: './reminders.html'
})
export class RemindersApp {
  private readonly injector = inject(Injector);
  private readonly data = inject(DesktopData);
  private readonly fields = viewChildren<ElementRef<HTMLInputElement>>('draft');
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

  protected readonly win = inject(DesktopWindow);
  protected readonly drafts = new ReminderDrafts(draft => this.writeDraft(draft));
  protected readonly lists = LISTS;
  protected readonly toggling = signal<ReadonlySet<string>>(new Set());
  protected readonly error = signal('');
  protected readonly items = computed<readonly ReminderRow[]>(() => {
    const known = new Set<string>(this.reminders().map(reminder => reminder.id));
    const open = this.drafts.rows().filter(draft => draft.createdId === null || !known.has(draft.createdId));
    return [...open.map(draftRow), ...this.reminders().map(rowOf)];
  });

  constructor() {
    const menus = inject(DesktopMenus);
    this.win.setMenus(computed(() => menus.standard('reminders')));
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
      this.win.confirmClose = null;
      this.win.hasUnsavedChanges.set(false);
      this.drafts.dispose();
    });
  }

  protected add(): void {
    if (this.win.closePending()) return;
    this.drafts.add();
    afterNextRender(() => this.fields().at(0)?.nativeElement.focus(), { injector: this.injector });
  }

  protected async toggle(item: ReminderRow): Promise<void> {
    if (item.fresh) {
      this.drafts.toggle(item.id);
      return;
    }
    if (this.writes.has(item.id)) return;
    const write = this.writeToggle(item.id);
    this.writes.set(item.id, write);
    this.toggling.set(new Set(this.writes.keys()));
    await write;
    this.writes.delete(item.id);
    this.toggling.set(new Set(this.writes.keys()));
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
          due: NEW_REMINDER_DUE,
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
}
