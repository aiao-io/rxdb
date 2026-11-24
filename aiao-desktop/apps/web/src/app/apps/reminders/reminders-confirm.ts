import { Component, inject, input } from '@angular/core';

import { PopoverService } from '../../services/popover';
import { FocusTrap } from '../../shared/focus-trap';

/**
 * 删除提醒的确认弹层：macOS 式的小对话框，Esc 或 Cancel 关闭，Delete 才执行删除。
 * 草稿行走「丢弃草稿」，库里的行才需要确认。
 */
@Component({
  selector: 'app-reminder-delete-panel',
  imports: [FocusTrap],
  host: { class: 'pop', style: 'width: 300px; padding: 14px' },
  template: `
    <div
      (keydown.escape)="popover.close()"
      appFocusTrap
      aria-label="Delete reminder"
      aria-modal="true"
      role="dialog"
      style="display: flex; flex-direction: column; gap: 12px"
    >
      <h2 style="font-size: 14px; margin: 0">
        {{ draft() ? 'Discard this reminder?' : 'Delete this reminder?' }}
      </h2>
      <p style="font-size: 12px; color: var(--txt-2); margin: 0">
        @if (draft()) {
          The reminder “{{ title() }}” has not been saved.
        } @else {
          “{{ title() }}” will be deleted from {{ folder() }}.
        }
      </p>
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <button class="btn" (click)="popover.close()" data-rdel-cancel tabindex="0" type="button">Cancel</button>
        <button class="btn" (click)="confirmDelete()" data-rdel-confirm tabindex="0" type="button">Delete</button>
      </div>
    </div>
  `
})
export class ReminderDeletePanel {
  protected readonly popover = inject(PopoverService);
  /** 提醒标题，确认文案里原样展示。 */
  readonly title = input.required<string>();
  /** 所属列表名（或 Today 兜底）。 */
  readonly folder = input('Today');
  /** 待删除的是草稿行：文案用「丢弃」。 */
  readonly draft = input(false);
  /** 确认后执行删除的回调。 */
  readonly remove = input.required<() => void>();

  protected confirmDelete(): void {
    this.popover.close(true);
    this.remove()();
  }
}
