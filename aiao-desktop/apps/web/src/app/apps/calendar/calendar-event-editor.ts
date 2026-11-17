import { Component, afterNextRender, inject, input } from '@angular/core';

import { CalendarDraftEditor, parseCalendarInput } from './calendar-draft';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { MONS3 } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { EventDate } from './calendar-model';

/** 编辑器收尾后回给日历窗口的结果：保存时是事件的新日期，删除时是 `null`。 */
export type EditorResult = (saved: EventDate | null) => void;

/** 事件编辑器：草稿模型由日历窗口持有，面板关闭后仍能恢复。 */
@Component({
  selector: 'app-calendar-event-editor',
  imports: [Icon],
  host: { class: 'pop ce', role: 'dialog', 'aria-label': 'Calendar event editor', style: 'width: 340px', '(keydown)': 'key($event)' },
  template: `
    <div class="ce-top">
      <div class="ce-title">{{ editor().base() ? 'Event' : 'New Event' }}</div>
      @if (editor().base(); as event) {
        <button
          class="tbtn"
          tabindex="0"
          [disabled]="editor().saving()"
          (click)="remove()"
          aria-label="Delete event"
          data-del
          title="Delete"
        ><svg appIcon="g-trash"></svg></button>
      }
    </div>
    @if (editor().value(); as value) {
      <input
        class="ce-name"
        #name
        [value]="value.title"
        [disabled]="editor().saving()"
        (input)="editor().edit({ title: name.value })"
        data-f="t"
        aria-label="Event title"
        placeholder="New Event"
        spellcheck="false"
        tabindex="0"
      />
      <input
        class="ce-loc"
        #location
        [value]="value.location"
        [disabled]="editor().saving()"
        (input)="editor().edit({ location: location.value })"
        data-f="loc"
        aria-label="Location"
        placeholder="Add Location"
        spellcheck="false"
        tabindex="0"
      />
      <div class="ce-body">
        <div class="ce-row">
          <span>all-day</span>
          <button
            class="sw"
            type="button"
            [class.on]="value.allDay"
            [attr.aria-checked]="value.allDay"
            [disabled]="editor().saving()"
            (click)="toggleAllDay(value.allDay)"
            aria-label="All-day event"
            data-allday
            style="margin-left: auto; transform: scale(0.82); transform-origin: left center"
            role="switch"
            tabindex="0"
          ><i></i></button>
        </div>
        <div class="ce-row">
          <span>date</span>
          <input
            #date
            [value]="value.date"
            [disabled]="editor().saving()"
            (input)="editor().edit({ date: date.value })"
            data-f="date"
            aria-label="Date"
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
                [value]="value.from"
                [disabled]="editor().saving()"
                (input)="editor().edit({ from: from.value })"
                data-f="from"
                aria-label="Start time"
                spellcheck="false"
                tabindex="0"
              />
            </div>
            <div class="ce-row">
              <span>to</span>
              <input
                #to
                [value]="value.to"
                [disabled]="editor().saving()"
                (input)="editor().edit({ to: to.value })"
                data-f="to"
                aria-label="End time"
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
                type="button"
                [attr.data-pickcal]="cal.id"
                [class.on]="value.calendar === cal.id"
                [style.background]="cal.c"
                [attr.aria-label]="cal.name"
                [attr.aria-pressed]="value.calendar === cal.id"
                [disabled]="editor().saving()"
                [title]="cal.name"
                (click)="editor().edit({ calendar: cal.id })"
                style="width: 15px; height: 15px"
                tabindex="0"
              ></button>
            }
          </div>
        </div>
      </div>
      <textarea
        class="ce-notes"
        #notes
        [value]="value.notes"
        [disabled]="editor().saving()"
        (input)="editor().edit({ notes: notes.value })"
        data-f="notes"
        aria-label="Notes"
        placeholder="Add Notes"
        spellcheck="false"
        tabindex="0"
      ></textarea>
      <div role="status" aria-live="polite" style="padding: 6px 14px; font-size: 12px">
        {{ editor().saving() ? 'Saving…' : editor().dirty() ? 'Unsaved changes' : 'Saved' }}
      </div>
      @if (editor().error(); as problem) {
        <p role="alert" style="margin: 6px 14px; overflow-wrap: anywhere">{{ problem }}</p>
      }
      <div class="ce-foot">
        <button class="btn" tabindex="0" (click)="cancel()" data-cancel>Close</button>
        @if (editor().dirty()) {
          <button class="btn" tabindex="0" [disabled]="editor().saving()" (click)="discard()">Discard Changes</button>
        }
        @if (editor().error()) {
          <button class="btn" tabindex="0" [disabled]="editor().saving()" (click)="saveCopy()">Save a Copy</button>
        }
        <button class="btn pri" tabindex="0" [disabled]="editor().saving()" (click)="save()" data-save>
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
    if (event.key === 'Enter' && (event.target as Element).tagName !== 'TEXTAREA' && (event.target as Element).tagName !== 'BUTTON') {
      event.preventDefault();
      void this.save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }
}
