import { Component, inject, input } from '@angular/core';

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
      appFocusTrap
      aria-label="Set due date"
      aria-modal="true"
      role="dialog"
      (keydown.escape)="popover.close()"
      style="display: flex; flex-direction: column; gap: 10px"
    >
      <h2 style="font-size: 13px; margin: 0">Due date</h2>
      <div style="display: flex; flex-direction: column; gap: 2px">
        @for (option of options; track option.id) {
          <button class="btn" (click)="choose(option.due)" tabindex="0" type="button" style="text-align: left">
            {{ option.label }}
          </button>
        }
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <input
          #day
          type="date"
          aria-label="Pick a date"
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
        />
        <button class="btn" (click)="chooseDate(day.value)" [disabled]="!day.value" tabindex="0" type="button">
          Set
        </button>
      </div>
    </div>
  `
})
export class ReminderDuePanel {
  private readonly popover = inject(PopoverService);
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
