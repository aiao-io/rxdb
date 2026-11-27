import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, type ConfirmDialogData } from '../components/confirm-dialog/confirm-dialog.component';
import { MODEL_DESIGNER_TRANSLATIONS } from '../i18n';

export type ConfirmDialogOptions = Omit<ConfirmDialogData, 'cancelText' | 'confirmText'> &
  Partial<Pick<ConfirmDialogData, 'cancelText' | 'confirmText'>>;

/**
 * 危险操作二次确认服务
 *
 * 基于 `@angular/cdk/dialog` 弹出 {@link ConfirmDialogComponent}，
 * 等待用户选择后 resolve `true`/`false`。
 *
 * 必须为 root：`ModelDesignService` 是 `providedIn: 'root'`，
 * `/er` 与 `/model-designer` 等路由都依赖它；若本服务仅挂在 Designer
 * 组件 providers 上，根级 ModelDesignService 构造时会 NG0201。
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  readonly #dialog = inject(Dialog);
  readonly #t = inject(MODEL_DESIGNER_TRANSLATIONS);

  async confirm(options: ConfirmDialogOptions): Promise<boolean> {
    const translations = this.#t().confirmDialog;
    const data: ConfirmDialogData = {
      ...options,
      cancelText: options.cancelText ?? translations.cancelButton,
      confirmText: options.confirmText ?? translations.confirmButton
    };
    const ref = this.#dialog.open<boolean, ConfirmDialogData>(ConfirmDialogComponent, {
      ariaLabel: options.title,
      data,
      disableClose: true,
      maxWidth: 'calc(100vw - 2rem)'
    });
    const result = await firstValueFrom(ref.closed);
    return result ?? false;
  }
}
