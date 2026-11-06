import { DestroyRef, Directive, effect, ElementRef, inject, input, output } from '@angular/core';

/**
 * 把受控的开关同步到原生 `<dialog>` 的模态状态：`open` 为真时 `showModal()`，为假时 `close()`；
 * 原生关闭（Esc、`dialog.close()`）通过 `closed` 回写。焦点陷阱、Esc 与背景惰性由浏览器负责。
 *
 * @remarks
 * - 同步发生在视图更新之后，因此 `showModal()` 调用时对话框内容（`@if (open)` 里的子树）已经渲染。
 * - Esc 先同步触发 `cancel`，原生 `close` 事件要晚十几毫秒才到：关闭在 `cancel` 时立刻回写，
 *   否则这段时间里应用再次请求打开（如快捷键）会被迟到的 `close` 事件覆盖。
 *   `close` 只在对话框确实处于关闭状态时才回写（程序化 `close()` 与不经 `cancel` 的关闭仍走这里）。
 *
 * 用法：`<dialog [rxdbAdminModal]="open()" (closed)="close()">`。
 */
@Directive({ selector: 'dialog[rxdbAdminModal]' })
export class AdminModalDirective {
  readonly #dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;

  /** 是否以模态方式打开。 */
  readonly open = input.required<boolean>({ alias: 'rxdbAdminModal' });

  /** 对话框被原生关闭（Esc 或 `dialog.close()`）时触发。 */
  readonly closed = output<void>();

  constructor() {
    const dialog = this.#dialog;
    const onCancel = (): void => this.closed.emit();
    const onClose = (): void => {
      if (!dialog.open) this.closed.emit();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    inject(DestroyRef).onDestroy(() => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    });
    effect(() => {
      const open = this.open();
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    });
  }
}

/**
 * 点击 `<dialog>` 自身（即 `::backdrop`）时关闭。
 * @param event - 点击事件。
 * @param close - 关闭动作。
 */
export function closeOnBackdrop(event: { target: unknown; currentTarget: unknown }, close: () => void): void {
  if (event.target === event.currentTarget) close();
}
