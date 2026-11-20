import { Component, output } from '@angular/core';

import { FocusTrap } from '../shared/focus-trap';

/** 清倒废纸篓前的不可逆操作确认。 */
@Component({
  selector: 'app-empty-trash-dialog',
  imports: [FocusTrap],
  template: `
    <div
      appFocusTrap
      aria-labelledby="empty-trash-title"
      aria-modal="true"
      class="empty-trash-dialog"
      role="alertdialog"
      (keydown.escape)="finish(false, $event)"
    >
      <div class="empty-trash-card">
        <h2 id="empty-trash-title">Empty Trash?</h2>
        <p>Are you sure you want to permanently erase the items in the Trash? This action cannot be undone.</p>
        <div class="empty-trash-actions">
          <button (click)="finish(false)" data-autofocus tabindex="0" type="button">Cancel</button>
          <button class="danger" (click)="finish(true)" tabindex="0" type="button">Empty Trash</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2000;
    }
    .empty-trash-dialog {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 20px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.28);
    }
    .empty-trash-card {
      width: min(390px, 100%);
      padding: 22px;
      box-sizing: border-box;
      border: 0.5px solid var(--line-2);
      border-radius: 12px;
      background: var(--win-2);
      color: var(--txt);
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
    }
    h2 {
      margin: 0 0 10px;
      font-size: 16px;
    }
    p {
      margin: 0;
      color: var(--txt-2);
      font-size: 12.5px;
      line-height: 1.5;
    }
    .empty-trash-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
    button {
      min-width: 82px;
      padding: 7px 13px;
      border: 0.5px solid var(--line-2);
      border-radius: 6px;
      background: var(--win);
      color: var(--txt);
      font: inherit;
    }
    button:hover {
      background: var(--hover);
    }
    button.danger {
      border-color: var(--red);
      background: var(--red);
      color: #fff;
    }
    button.danger:hover {
      filter: brightness(1.08);
    }
  `
})
export class EmptyTrashDialog {
  readonly finished = output<boolean>();

  protected finish(confirmed: boolean, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.finished.emit(confirmed);
  }
}
