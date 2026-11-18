import { Component, afterNextRender, inject, input } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { MONS3 } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { CalendarDraftEditor, parseCalendarInput } from './calendar-draft';
import { EventDate } from './calendar-model';

/** 编辑器收尾后回给日历窗口的结果：保存时是事件的新日期，删除时是 `null`。 */
export type EditorResult = (saved: EventDate | null) => void;

/** 事件编辑器：草稿模型由日历窗口持有，面板关闭后仍能恢复。 */
@Component({
  selector: 'app-calendar-event-editor',
  imports: [Icon],
  host: {
    class: 'pop ce',
    role: 'dialog',
    'aria-label': 'Calendar event editor',
    style: 'width: 340px',
    '(keydown)': 'key($event)'
  },
  template: `
    <div class="ce-top">
      <div class="ce-title">{{ editor().base() ? 'Event' : 'New Event' }}</div>
      @if (editor().base(); as event) {
        <button
          class="tbtn"
          [disabled]="editor().saving()"
          (click)="remove()"
          aria-label="Delete event"
          data-del
          tabindex="0"
          title="Delete"
        >
          <svg appIcon="g-trash"></svg>
        </button>
      }
    </div>
    @if (editor().value(); as value) {
      <input
        class="ce-name"
        #name
        [disabled]="editor().saving()"
        [value]="value.title"
        (input)="editor().edit({ title: name.value })"
        aria-label="Event title"
        data-f="t"
        placeholder="New Event"
        spellcheck="false"
        tabindex="0"
      />
      <input
        class="ce-loc"
        #location
        [disabled]="editor().saving()"
        [value]="value.location"
        (input)="editor().edit({ location: location.value })"
        aria-label="Location"
        data-f="loc"
        placeholder="Add Location"
        spellcheck="false"
        tabindex="0"
      />
      <div class="ce-body">
        <div class="ce-row">
          <span>all-day</span>
          <button
            class="sw"
            [attr.aria-checked]="value.allDay"
            [class.on]="value.allDay"
            [disabled]="editor().saving()"
            (click)="toggleAllDay(value.allDay)"
            aria-label="All-day event"
            data-allday
            role="switch"
            style="margin-left: auto; transform: scale(0.82); transform-origin: left center"
            tabindex="0"
            type="button"
          >
            <i></i>
          </button>
        </div>
        <div class="ce-row">
          <span>date</span>
          <input
            #date
            [disabled]="editor().saving()"
            [value]="value.date"
            (input)="editor().edit({ date: date.value })"
            aria-label="Date"
            data-f="date"
            spellcheck="false"
            tabindex="0"
          />
        </div>
        @if (!value.allDay) {
          <div data-times>
            <div class="ce-row">
              <span>from</span>
              <input
                #from
                [disabled]="editor().saving()"
                [value]="value.from"
                (input)="editor().edit({ from: from.value })"
                aria-label="Start time"
                data-f="from"
                spellcheck="false"
                tabindex="0"
              />
            </div>
            <div class="ce-row">
              <span>to</span>
              <input
                #to
                [disabled]="editor().saving()"
                [value]="value.to"
                (input)="editor().edit({ to: to.value })"
                aria-label="End time"
                data-f="to"
                spellcheck="false"
                tabindex="0"
              />
            </div>
          </div>
        }
        <div class="ce-row">
          <span>calendar</span>
          <div class="ce-cals" style="margin-left: auto">
            @for (cal of calendars(); track cal.id) {
              <button
                class="acc"
                [attr.aria-label]="cal.name"
                [attr.aria-pressed]="value.calendar === cal.id"
                [attr.data-pickcal]="cal.id"
                [class.on]="value.calendar === cal.id"
                [disabled]="editor().saving()"
                [style.background]="cal.c"
                [title]="cal.name"
                (click)="editor().edit({ calendar: cal.id })"
                style="width: 15px; height: 15px"
                tabindex="0"
                type="button"
              ></button>
            }
          </div>
        </div>
      </div>
      <textarea
        class="ce-notes"
        #notes
        [disabled]="editor().saving()"
        [value]="value.notes"
        (input)="editor().edit({ notes: notes.value })"
        aria-label="Notes"
        data-f="notes"
        placeholder="Add Notes"
        spellcheck="false"
        tabindex="0"
      ></textarea>
      <div aria-live="polite" role="status" style="padding: 6px 14px; font-size: 12px">
        {{
          editor().saving() ? 'Saving…'
          : editor().dirty() ? 'Unsaved changes'
          : 'Saved'
        }}
      </div>
      @if (editor().error(); as problem) {
        <p role="alert" style="margin: 6px 14px; overflow-wrap: anywhere">{{ problem }}</p>
      }
      <div class="ce-foot">
        <button class="btn" (click)="cancel()" data-cancel tabindex="0">Close</button>
        @if (editor().dirty()) {
          <button class="btn" [disabled]="editor().saving()" (click)="discard()" tabindex="0">Discard Changes</button>
        }
        @if (editor().error()) {
          <button class="btn" [disabled]="editor().saving()" (click)="saveCopy()" tabindex="0">Save a Copy</button>
        }
        <button class="btn pri" [disabled]="editor().saving()" (click)="save()" data-save tabindex="0">
          {{ editor().base() ? 'Done' : 'Add' }}
        </button>
      </div>
    }
  `
})
export class CalendarEventEditor {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  readonly editor = input.required<CalendarDraftEditor>();
  readonly calendars = input.required<readonly { readonly id: string; readonly name: string; readonly c: string }[]>();
  readonly done = input.required<EditorResult>();

  constructor() {
    afterNextRender(() => {
      setTimeout(() => document.querySelector<HTMLElement>('.ce-name')?.focus(), 60);
    });
  }

  protected toggleAllDay(allDay: boolean): void {
    this.editor().edit({ allDay: !allDay });
  }

  protected cancel(): void {
    this.popover.close(false, 'command');
  }

  protected discard(): void {
    if (!this.editor().discard()) return;
    this.popover.close(false, 'command');
  }

  protected async remove(): Promise<void> {
    const event = this.editor().base();
    if (!event || !(await this.editor().remove())) return;
    this.popover.close(false, 'command');
    this.done()(null);
    this.toast.show('Event deleted');
  }

  protected async saveCopy(): Promise<void> {
    if (!this.editor().makeCopy()) return;
    await this.save();
  }

  protected async save(): Promise<void> {
    if (!(await this.editor().save())) return;
    const value = this.editor().value();
    if (!value) return;
    const date = parseCalendarInput(value).d;
    const title = value.title.trim();
    this.popover.close(false, 'command');
    this.done()(date);
    this.toast.show(this.editor().base() ? `Saved “${title}”` : `Added “${title}” on ${MONS3[date[1]]} ${date[2]}`);
  }

  protected key(event: KeyboardEvent): void {
    if (
      event.key === 'Enter' &&
      (event.target as Element).tagName !== 'TEXTAREA' &&
      (event.target as Element).tagName !== 'BUTTON'
    ) {
      event.preventDefault();
      void this.save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}
