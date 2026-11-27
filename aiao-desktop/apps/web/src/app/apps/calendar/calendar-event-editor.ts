import { Component, afterNextRender, inject, input } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

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
    '[attr.aria-label]': "i18n.t('apps.calendar.eventEditor')",
    style: 'width: 340px',
    '(keydown)': 'key($event)'
  },
  template: `
    <div class="ce-top">
      <div class="ce-title">
        {{ editor().base() ? i18n.t('apps.calendar.event') : i18n.t('apps.calendar.newEvent') }}
      </div>
      @if (editor().base(); as event) {
        <button
          class="tbtn"
          [attr.aria-label]="i18n.t('apps.calendar.deleteEvent')"
          [disabled]="editor().saving()"
          [title]="i18n.t('apps.calendar.delete')"
          (click)="remove()"
          data-del
          tabindex="0"
        >
          <svg appIcon="g-trash"></svg>
        </button>
      }
    </div>
    @if (editor().value(); as value) {
      <input
        class="ce-name"
        #name
        [attr.aria-label]="i18n.t('apps.calendar.eventTitle')"
        [disabled]="editor().saving()"
        [placeholder]="i18n.t('apps.calendar.newEvent')"
        [value]="value.title"
        (input)="editor().edit({ title: name.value })"
        data-f="t"
        spellcheck="false"
        tabindex="0"
      />
      <input
        class="ce-loc"
        #location
        [attr.aria-label]="i18n.t('apps.calendar.location')"
        [disabled]="editor().saving()"
        [placeholder]="i18n.t('apps.calendar.addLocation')"
        [value]="value.location"
        (input)="editor().edit({ location: location.value })"
        data-f="loc"
        spellcheck="false"
        tabindex="0"
      />
      <div class="ce-body">
        <div class="ce-row">
          <span>{{ i18n.t('apps.calendar.allDay') }}</span>
          <button
            class="sw"
            [attr.aria-checked]="value.allDay"
            [attr.aria-label]="i18n.t('apps.calendar.allDayEvent')"
            [class.on]="value.allDay"
            [disabled]="editor().saving()"
            (click)="toggleAllDay(value.allDay)"
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
          <span>{{ i18n.t('apps.calendar.dateRow') }}</span>
          <input
            #date
            [attr.aria-label]="i18n.t('apps.calendar.date')"
            [disabled]="editor().saving()"
            [value]="value.date"
            (input)="editor().edit({ date: date.value })"
            data-f="date"
            spellcheck="false"
            tabindex="0"
          />
        </div>
        @if (!value.allDay) {
          <div data-times>
            <div class="ce-row">
              <span>{{ i18n.t('apps.calendar.fromRow') }}</span>
              <input
                #from
                [attr.aria-label]="i18n.t('apps.calendar.startTime')"
                [disabled]="editor().saving()"
                [value]="value.from"
                (input)="editor().edit({ from: from.value })"
                data-f="from"
                spellcheck="false"
                tabindex="0"
              />
            </div>
            <div class="ce-row">
              <span>{{ i18n.t('apps.calendar.toRow') }}</span>
              <input
                #to
                [attr.aria-label]="i18n.t('apps.calendar.endTime')"
                [disabled]="editor().saving()"
                [value]="value.to"
                (input)="editor().edit({ to: to.value })"
                data-f="to"
                spellcheck="false"
                tabindex="0"
              />
            </div>
          </div>
        }
        <div class="ce-row">
          <span>{{ i18n.t('apps.calendar.calendar') }}</span>
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
        [attr.aria-label]="i18n.t('apps.calendar.notes')"
        [disabled]="editor().saving()"
        [placeholder]="i18n.t('apps.calendar.addNotes')"
        [value]="value.notes"
        (input)="editor().edit({ notes: notes.value })"
        data-f="notes"
        spellcheck="false"
        tabindex="0"
      ></textarea>
      <div aria-live="polite" role="status" style="padding: 6px 14px; font-size: 12px">
        {{
          editor().saving() ? i18n.t('apps.calendar.saving')
          : editor().dirty() ? i18n.t('apps.calendar.unsaved')
          : i18n.t('apps.calendar.saved')
        }}
      </div>
      @if (editor().error(); as problem) {
        <p role="alert" style="margin: 6px 14px; overflow-wrap: anywhere">{{ problem }}</p>
      }
      <div class="ce-foot">
        <button class="btn" (click)="cancel()" data-cancel tabindex="0">{{ i18n.t('apps.calendar.close') }}</button>
        @if (editor().dirty()) {
          <button class="btn" [disabled]="editor().saving()" (click)="discard()" tabindex="0">
            {{ i18n.t('apps.calendar.discardChanges') }}
          </button>
        }
        @if (editor().error()) {
          <button class="btn" [disabled]="editor().saving()" (click)="saveCopy()" tabindex="0">
            {{ i18n.t('apps.calendar.saveCopy') }}
          </button>
        }
        <button class="btn pri" [disabled]="editor().saving()" (click)="save()" data-save tabindex="0">
          {{ editor().base() ? i18n.t('apps.calendar.done') : i18n.t('apps.calendar.add') }}
        </button>
      </div>
    }
  `
})
export class CalendarEventEditor {
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  protected readonly i18n = useI18n();
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
    this.toast.show('apps.calendar.eventDeleted');
  }

  protected async saveCopy(): Promise<void> {
    if (!this.editor().makeCopy()) return;
    await this.save();
  }

  protected async save(): Promise<void> {
    if (!(await this.editor().save())) return;
    const value = this.editor().value();
    if (!value) return;
    const date = parseCalendarInput(value, key => this.i18n.t(key)).d;
    const title = value.title.trim();
    this.popover.close(false, 'command');
    this.done()(date);
    this.toast.show(
      this.editor().base() ? 'apps.calendar.savedEvent' : 'apps.calendar.addedEvent',
      this.editor().base() ? { name: title } : { name: title, date: `${MONS3[date[1]]} ${date[2]}` }
    );
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
