import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

/** {@link ConfirmDialogComponent} 的对话框数据 */
export interface ConfirmDialogData {
  title: string;
  message: string;
  cancelText: string;
  confirmText: string;
  danger?: boolean;
}

/** 危险操作二次确认弹窗，经 {@link ConfirmDialogService} 打开，`close()` 结果为用户的确认选择 */
@Component({
  selector: 'lib-confirm-dialog',
  template: `
    <section
      class="bg-base-100 text-base-content rounded-box w-[min(32rem,calc(100vw-2rem))] p-6 shadow-xl"
      data-testid="confirm-dialog-surface"
    >
      <h3 class="text-lg font-bold">{{ data.title }}</h3>
      <p class="py-4">{{ data.message }}</p>
      <div class="modal-action">
        <button class="btn min-h-11" (click)="onCancel()" type="button">
          {{ data.cancelText }}
        </button>
        <button
          class="btn min-h-11"
          [class.btn-error]="data.danger"
          [class.btn-primary]="!data.danger"
          (click)="onConfirm()"
          type="button"
        >
          {{ data.confirmText }}
        </button>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  readonly #dialogRef = inject(DialogRef<boolean>);
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);

  onConfirm() {
    this.#dialogRef.close(true);
  }

  onCancel() {
    this.#dialogRef.close(false);
  }
}
