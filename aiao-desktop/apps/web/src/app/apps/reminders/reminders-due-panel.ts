import { Component, inject, input } from '@angular/core';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { PopoverService } from '../../services/popover';
import { FocusTrap } from '../../shared/focus-trap';
import { dueLabel, dueOptions } from './reminders-model';

/**
 * 提醒的到期日选择：今天 / 明天 / 下周三个快捷项，或选一个具体日期。
 * Esc 或点外面关闭；选定后回调带着时间说明（如 `Today`、`Thu, Dec 31`）。
 */
@Component({
  selector: 'app-reminder-due-panel',
  imports: [FocusTrap],
  host: { class: 'pop', style: 'width: 250px; padding: 12px' },
  template: `
    <div
      [attr.aria-label]="i18n.t('apps.reminders.setDueDate')"
      (keydown.escape)="popover.close()"
      appFocusTrap
      aria-modal="true"
      role="dialog"
      style="display: flex; flex-direction: column; gap: 10px"
    >
      <h2 style="font-size: 13px; margin: 0">{{ i18n.t('apps.reminders.dueDate') }}</h2>
      <div style="display: flex; flex-direction: column; gap: 2px">
        @for (option of options; track option.id) {
          <button class="btn" (click)="choose(option.due)" style="text-align: left" tabindex="0" type="button">
            {{ i18n.t(option.label) }}
          </button>
        }
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <input
          #day
          [attr.aria-label]="i18n.t('apps.reminders.pickDate')"
          data-rdue-date
          style="
            flex: 1;
            min-width: 0;
            box-sizing: border-box;
            font-size: 12px;
            padding: 3px 6px;
            border: 1px solid var(--line);
            border-radius: 6px;
            background: var(--win-2);
            color: var(--txt);
          "
          type="date"
        />
        <button class="btn" [disabled]="!day.value" (click)="chooseDate(day.value)" tabindex="0" type="button">
          {{ i18n.t('apps.reminders.set') }}
        </button>
      </div>
    </div>
  `
})
export class ReminderDuePanel {
  private readonly popover = inject(PopoverService);
  protected readonly i18n = useI18n();
  protected readonly options = dueOptions();

  /** 选定后回调，参数是显示用时间说明。 */
  readonly submit = input.required<(due: string) => void>();

  protected choose(due: string): void {
    this.popover.close(true);
    this.submit()(due);
  }

  protected chooseDate(value: string): void {
    if (!value) return;
    this.choose(dueLabel(new Date(`${value}T12:00:00`)));
  }
}
