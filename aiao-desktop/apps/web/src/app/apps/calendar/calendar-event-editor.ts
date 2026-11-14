import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  viewChild
} from '@angular/core';

import { CalendarEvent, CalendarEventDraft, CalendarStore, clockLabel } from '../../services/calendar-store';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { MONS3 } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { EventDate, dateLabel, parseClock, parseDate } from './calendar-model';

/** 编辑器收尾后回给日历窗口的结果：保存时是事件的新日期，删除时是 `null`。 */
export type EditorResult = (saved: EventDate | null) => void;

/** 事件编辑器：新建与编辑共用一个面板，形态上是 Calendar 的检查器浮层。 */
@Component({
  selector: 'app-calendar-event-editor',
  imports: [Icon],
  host: { class: 'pop ce', style: 'width: 340px', '(keydown)': 'key($event)' },
  template: `
    <div class="ce-top">
      <div class="ce-title">{{ event() ? 'Event' : 'New Event' }}</div>
      @if (event()) {
        <button class="tbtn" (click)="remove()" data-del title="Delete"><svg appIcon="g-trash"></svg></button>
      }
    </div>
    <input class="ce-name" #name [value]="draft().t" data-f="t" placeholder="New Event" spellcheck="false" />
    <input class="ce-loc" #location [value]="draft().loc" data-f="loc" placeholder="Add Location" spellcheck="false" />
    <div class="ce-body">
      <div class="ce-row">
        <span>all-day</span>
        <div
          class="sw"
          [class.on]="allDay()"
          (click)="allDay.set(!allDay())"
          (keydown.enter)="allDay.set(!allDay())"
          data-allday
          style="margin-left: auto; transform: scale(0.82); transform-origin: left center"
          tabindex="-1"
        ></div>
      </div>
      <div class="ce-row"><span>date</span><input #date [value]="dateText()" data-f="date" spellcheck="false" /></div>
      <div [style.display]="allDay() ? 'none' : null" data-times>
        <div class="ce-row"><span>from</span><input #from [value]="fromText()" data-f="from" spellcheck="false" /></div>
        <div class="ce-row"><span>to</span><input #to [value]="toText()" data-f="to" spellcheck="false" /></div>
      </div>
      <div class="ce-row">
        <span>calendar</span>
        <div class="ce-cals" style="margin-left: auto">
          @for (cal of store.calendars(); track cal.id) {
            <span
              class="acc"
              [attr.data-pickcal]="cal.id"
              [class.on]="calendar() === cal.id"
              [style.background]="cal.c"
              [title]="cal.name"
              (click)="calendar.set(cal.id)"
              (keydown.enter)="calendar.set(cal.id)"
              style="width: 15px; height: 15px"
              tabindex="-1"
            ></span>
          }
        </div>
      </div>
    </div>
    <textarea
      class="ce-notes"
      #notes
      [value]="draft().notes"
      data-f="notes"
      placeholder="Add Notes"
      spellcheck="false"
    ></textarea>
    <div class="ce-foot">
      <button class="btn" (click)="cancel()" data-cancel>Cancel</button>
      <button class="btn pri" (click)="save()" data-save>{{ event() ? 'Done' : 'Add' }}</button>
    </div>
  `
})
export class CalendarEventEditor {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('name');
  private readonly locationField = viewChild.required<ElementRef<HTMLInputElement>>('location');
  private readonly dateField = viewChild.required<ElementRef<HTMLInputElement>>('date');
  private readonly fromField = viewChild.required<ElementRef<HTMLInputElement>>('from');
  private readonly toField = viewChild.required<ElementRef<HTMLInputElement>>('to');
  private readonly notesField = viewChild.required<ElementRef<HTMLTextAreaElement>>('notes');
  /** 写库期间为 `true`：连按回车或连点按钮不会写两次。 */
  private saving = false;

  protected readonly store = inject(CalendarStore);
  protected readonly allDay = linkedSignal(() => this.draft().s === null);
  protected readonly calendar = linkedSignal(() => this.draft().cal);
  protected readonly dateText = computed(() => dateLabel(this.draft().d));
  protected readonly fromText = computed(() => clockLabel(this.draft().s ?? 540));
  protected readonly toText = computed(() => clockLabel((this.draft().s ?? 540) + (this.draft().dur || 60)));

  /** 正在编辑的事件；新建时为 `null`。 */
  readonly event = input<CalendarEvent | null>(null);
  /** 面板初始值：编辑时是事件本身的字段，新建时是按点击位置推出的默认值。 */
  readonly draft = input.required<CalendarEventDraft>();
  readonly done = input.required<EditorResult>();

  constructor() {
    afterNextRender(() => setTimeout(() => this.nameField().nativeElement.focus(), 60));
  }

  protected cancel(): void {
    this.popover.close();
  }

  protected async remove(): Promise<void> {
    const event = this.event();
    if (!event || this.saving) return;
    this.saving = true;
    try {
      await this.store.remove(event.id);
    } finally {
      this.saving = false;
    }
    this.popover.close();
    this.done()(null);
    this.toast.show('Event deleted');
  }

  protected async save(): Promise<void> {
    if (this.saving) return;
    const draft = this.draft();
    const event = this.event();
    const d = parseDate(this.dateField().nativeElement.value, draft.d);
    const s = this.allDay() ? null : parseClock(this.fromField().nativeElement.value, draft.s ?? 540);
    /* 结束早于开始在 Calendar 里表示次日；一张网格里只有夹到最少 15 分钟才说得通。 */
    const dur = s === null ? 0 : Math.max(15, parseClock(this.toField().nativeElement.value, s + 60) - s);
    const t = this.nameField().nativeElement.value.trim() || 'New Event';
    const fields: CalendarEventDraft = {
      d,
      t,
      s,
      dur,
      cal: this.calendar(),
      loc: this.locationField().nativeElement.value.trim(),
      notes: this.notesField().nativeElement.value
    };
    this.saving = true;
    try {
      if (event) await this.store.update(event.id, fields);
      else await this.store.add(fields);
    } finally {
      this.saving = false;
    }
    this.popover.close();
    this.done()(d);
    this.toast.show(event ? 'Event updated' : `Added “${t}” on ${MONS3[d[1]]} ${d[2]}`);
  }

  /** 回车保存（文本框除外），Esc 关闭。 */
  protected key(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.target as Element).tagName !== 'TEXTAREA') {
      event.preventDefault();
      this.save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.popover.close();
    }
  }
}
