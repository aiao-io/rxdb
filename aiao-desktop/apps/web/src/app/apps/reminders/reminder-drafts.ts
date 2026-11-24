import { computed, signal } from '@angular/core';

import { localWriteFailureMessage as reminderFailureMessage } from '../../data/local-write-error';

export { reminderFailureMessage };

import { NEW_REMINDER_DUE, type ReminderDraft } from './reminders-model';
import type { Reminder } from './reminders.entities';

/** 草稿使用稳定 ID 重试，写入端不得覆盖同 ID 的不同内容。 */
export interface ReminderWrite {
  readonly id: Reminder['id'];
  readonly title: string;
  readonly done: boolean;
  /** 用户给草稿选好的时间说明。 */
  readonly due: string;
}

export interface ReminderDraftState extends ReminderDraft {
  readonly id: ReminderWrite['id'];
  readonly error: string;
}

/** 记录输入及进行中的写入；成功行由活查询接管，失败内容保留到重试或明确丢弃。 */
export class ReminderDrafts {
  private readonly state = signal<readonly ReminderDraftState[]>([]);
  private readonly writes = new Map<string, Promise<boolean>>();
  private readonly writing = signal(0);
  private disposed = false;

  readonly rows = this.state.asReadonly();
  readonly pending = computed(() => this.writing() > 0);
  readonly dirty = computed(
    () => this.pending() || this.state().some(draft => draft.createdId === null && draft.title.trim().length > 0)
  );

  constructor(
    private readonly write: (draft: ReminderWrite) => Promise<void>,
    private readonly createId: () => ReminderWrite['id'] = () => crypto.randomUUID()
  ) {}

  add(): string {
    const id = this.createId();
    this.state.update(rows => [
      { id, title: '', done: false, due: NEW_REMINDER_DUE, editing: true, createdId: null, error: '' },
      ...rows
    ]);
    return id;
  }

  edit(id: string, title: string): void {
    this.change(id, { title });
  }

  setDue(id: string, due: string): void {
    this.change(id, { due });
  }

  toggle(id: string): void {
    const draft = this.state().find(row => row.id === id);
    if (draft) this.change(id, { done: !draft.done });
  }

  errorFor(id: string): string {
    return this.state().find(row => row.id === id)?.error ?? '';
  }

  discard(id: string): boolean {
    if (this.writes.has(id)) return false;
    this.state.update(rows => rows.filter(row => row.id !== id));
    return true;
  }

  reconcile(known: ReadonlySet<string>): void {
    this.state.update(rows => rows.filter(row => row.createdId === null || !known.has(row.createdId)));
  }

  save(id: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const pending = this.writes.get(id);
    if (pending) return pending;
    const draft = this.state().find(row => row.id === id);
    if (!draft || !draft.editing) return Promise.resolve(true);
    const title = draft.title.trim();
    if (!title) return Promise.resolve(this.discard(id));
    this.patch(id, { editing: false, createdId: id, error: '' });
    const result = Promise.resolve()
      .then(() => this.write({ id: draft.id, title, done: draft.done, due: draft.due }))
      .then(
        () => !this.disposed,
        error => {
          if (!this.disposed)
            this.patch(id, {
              editing: true,
              createdId: null,
              error: reminderFailureMessage(error)
            });
          return false;
        }
      )
      .finally(() => {
        this.writes.delete(id);
        this.writing.set(this.writes.size);
      });
    this.writes.set(id, result);
    this.writing.set(this.writes.size);
    return result;
  }

  async saveAll(): Promise<boolean> {
    if (this.disposed) return false;
    const ids = new Set([...this.writes.keys(), ...this.state().map(row => row.id)]);
    let saved = true;
    for (const id of ids) saved = (await this.save(id)) && saved;
    return saved && !this.dirty();
  }

  dispose(): void {
    this.disposed = true;
    this.state.set([]);
  }

  private change(id: string, fields: Partial<Pick<ReminderWrite, 'title' | 'done' | 'due'>>): void {
    this.state.update(rows => rows.map(row => (row.id === id && row.editing ? { ...row, ...fields, error: '' } : row)));
  }

  private patch(id: string, fields: Partial<ReminderDraftState>): void {
    this.state.update(rows => rows.map(row => (row.id === id ? { ...row, ...fields } : row)));
  }
}
