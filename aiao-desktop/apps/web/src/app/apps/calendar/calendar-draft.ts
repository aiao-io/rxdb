import { computed, signal } from '@angular/core';

import { localWriteFailureMessage } from '../../data/local-write-error';
import { CalendarChangeError } from '../../services/calendar-records';
import { CalendarEvent, CalendarEventDraft, clockLabel } from '../../services/calendar-store';
import type { CalendarEventRow } from '../../services/calendar.entities';
import { dateLabel, parseClock, parseDate } from './calendar-model';

export interface CalendarInput {
  readonly title: string;
  readonly location: string;
  readonly date: string;
  readonly from: string;
  readonly to: string;
  readonly allDay: boolean;
  readonly calendar: string;
  readonly notes: string;
}
export interface CalendarDraftWrite {
  readonly id: CalendarEventRow['id'];
  readonly fields: CalendarEventDraft;
  readonly base: CalendarEvent | null;
}

class CalendarInputError extends Error {}

/**
 * 解析编辑器表单；校验失败抛出的消息面向用户。
 * `translate` 可选：调用方注入 i18n 翻译函数时文案按当前语言显示（与 print-document 的服务注入风格一致）。
 */
export function parseCalendarInput(value: CalendarInput, translate?: (key: string) => string): CalendarEventDraft {
  // 函数声明 + 显式 never 返回：调用后控制流窄化（箭头函数没有这个语义）。
  function fail(key: string, english: string): never {
    throw new CalendarInputError(translate?.(key) ?? english);
  }
  const t = value.title.trim();
  if (!t) fail('error.calendar.enterEventTitle', 'Enter an event title.');
  const d = parseDate(value.date);
  if (!d) fail('error.calendar.validDate', 'Enter a valid date, such as 2026-11-17 or Nov 17, 2026.');
  if (!value.calendar) fail('error.calendar.chooseCalendar', 'Choose a calendar.');
  const s = value.allDay ? null : parseClock(value.from);
  const end = value.allDay ? null : parseClock(value.to);
  if (!value.allDay && s === null) fail('error.calendar.validStartTime', 'Enter a valid start time, such as 9:30 AM.');
  if (!value.allDay && end === null) fail('error.calendar.validEndTime', 'Enter a valid end time, such as 10:30 AM.');
  if (s !== null && end !== null && end <= s)
    fail('error.calendar.endAfterStart', 'The end time must be after the start on the same day.');
  return {
    d,
    t,
    s,
    dur: s !== null && end !== null ? end - s : 0,
    cal: value.calendar,
    loc: value.location.trim(),
    notes: value.notes
  };
}

const inputOf = (draft: CalendarEventDraft): CalendarInput => ({
  title: draft.t,
  location: draft.loc,
  notes: draft.notes,
  date: dateLabel(draft.d),
  from: clockLabel(draft.s ?? 540),
  to: clockLabel((draft.s ?? 540) + (draft.dur || 60)),
  allDay: draft.s === null,
  calendar: draft.cal
});

/** 原始输入独立于面板存在；保存与删除期间冻结输入，只有明确放弃才丢弃草稿。 */
export class CalendarDraftEditor {
  private readonly state = signal<CalendarInput | null>(null);
  private readonly initial = signal<CalendarInput | null>(null);
  private readonly original = signal<CalendarEvent | null>(null);
  private readonly identity = signal<CalendarEventRow['id'] | null>(null);
  private readonly working = signal(false);
  private readonly failure = signal('');
  private pending: Promise<boolean> | null = null;
  private disposed = false;

  readonly value = this.state.asReadonly();
  readonly base = this.original.asReadonly();
  readonly id = this.identity.asReadonly();
  readonly saving = this.working.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly dirty = computed(
    () => this.value() !== null && JSON.stringify(this.value()) !== JSON.stringify(this.initial())
  );

  constructor(
    private readonly write: (change: CalendarDraftWrite) => Promise<void>,
    private readonly deleteEvent: (event: CalendarEvent) => Promise<void>,
    private readonly createId: () => CalendarEventRow['id'] = () => crypto.randomUUID(),
    private readonly translate?: (key: string) => string
  ) {}

  open(draft: CalendarEventDraft, base: CalendarEvent | null): boolean {
    if (this.disposed || this.saving() || this.dirty()) return false;
    const value = inputOf(draft);
    this.state.set(value);
    this.initial.set(value);
    this.original.set(base);
    this.identity.set(base ? (base.id as CalendarEventRow['id']) : this.createId());
    this.failure.set('');
    return true;
  }

  edit(fields: Partial<CalendarInput>): void {
    if (this.disposed || this.saving()) return;
    this.state.update(value => (value ? { ...value, ...fields } : null));
    if (!this.failure()) return;
    const value = this.value();
    if (!value) {
      this.failure.set('');
      return;
    }
    try {
      parseCalendarInput(value, this.translate);
      this.failure.set('');
    } catch (error) {
      this.failure.set(error instanceof CalendarInputError ? error.message : '');
    }
  }

  discard(): boolean {
    if (this.disposed || this.saving()) return false;
    this.clear();
    return true;
  }

  makeCopy(): boolean {
    if (!this.value() || this.disposed || this.saving()) return false;
    this.identity.set(this.createId());
    this.original.set(null);
    this.initial.set(null);
    this.failure.set('');
    return true;
  }

  save(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const value = this.value();
    const id = this.id();
    if (!value || !id) return Promise.resolve(false);
    return this.run(async () => {
      const fields = parseCalendarInput(value, this.translate);
      await this.write({ id, fields, base: this.base() });
      if (this.disposed) return;
      this.original.set({ ...fields, id });
      this.initial.set(value);
    });
  }

  remove(): Promise<boolean> {
    const base = this.base();
    if (this.disposed || !base || this.saving()) return Promise.resolve(false);
    return this.run(async () => {
      await this.deleteEvent(base);
      if (!this.disposed) this.clear();
    });
  }

  async settle(): Promise<boolean> {
    return this.pending ?? !this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private run(work: () => Promise<void>): Promise<boolean> {
    this.working.set(true);
    this.failure.set('');
    this.pending = Promise.resolve()
      .then(work)
      .then(
        () => !this.disposed,
        error => {
          if (!this.disposed)
            this.failure.set(
              error instanceof CalendarInputError || error instanceof CalendarChangeError ?
                error.message
              : localWriteFailureMessage(error, this.translate)
            );
          return false;
        }
      )
      .finally(() => {
        this.working.set(false);
        this.pending = null;
      });
    return this.pending;
  }

  private clear(): void {
    this.state.set(null);
    this.initial.set(null);
    this.original.set(null);
    this.identity.set(null);
    this.failure.set('');
  }
}
