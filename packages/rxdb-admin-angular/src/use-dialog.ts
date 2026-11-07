import { DestroyRef, Directive, effect, ElementRef, inject, input, output, signal } from '@angular/core';

/**
 * 把受控的开关同步到原生 `<dialog>` 的模态状态：`open` 为真时 `showModal()`，为假时 `close()`；
 * 原生关闭（Esc、`dialog.close()`）通过 `closed` 回写。焦点陷阱、Esc 与背景惰性由浏览器负责。
 *
 * @remarks
 * - 同步发生在视图更新之后，因此 `showModal()` 调用时对话框内容（`@if (open)` 里的子树）已经渲染。
 * - Esc 先同步触发 `cancel`，原生 `close` 事件要晚十几毫秒才到：关闭在 `cancel` 时立刻回写，
 *   而紧跟在这次 `cancel` 之后的那个 `close` 只是它的尾声，不再回写——否则这段时间里应用再次请求打开
 *   （如快捷键）会被迟到的 `close` 覆盖。不经 `cancel` 的原生关闭（程序化 `close()`）仍由 `close` 回写。
 * - 零 zone 下「写回关闭」与「再次请求打开」可能落在同一轮变更检测之前：模板绑定的 true → false → true
 *   被折叠成没有变化，输入不会更新。每次原生 `cancel` / `close` 都让同步 effect 重新对账一次，
 *   于是原生已经关闭、而模型想要打开的对话框会被重新 `showModal()`。
 *
 * 用法：`<dialog [rxdbAdminModal]="open()" (closed)="close()">`。
 */
@Directive({ selector: 'dialog[rxdbAdminModal]' })
export class AdminModalDirective {
  readonly #dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  /** 原生 `cancel` / `close` 的次数：同步 effect 依赖它，每次原生状态变化后都按最新的 `open` 重新对账。 */
  readonly #native = signal(0);
  /** 最近一次还没等到 `close` 的 `cancel`（Esc）；被 `preventDefault` 的 `cancel` 不会有 `close`。 */
  #cancel: Event | undefined;

  /** 是否以模态方式打开。 */
  readonly open = input.required<boolean>({ alias: 'rxdbAdminModal' });

  /** 对话框被原生关闭（Esc 或 `dialog.close()`）时触发。 */
  readonly closed = output<void>();

  constructor() {
    const dialog = this.#dialog;
    const onCancel = (event: Event): void => {
      this.#cancel = event;
      this.closed.emit();
      this.#native.update(count => count + 1);
    };
    const onClose = (): void => {
      const tail = this.#cancel !== undefined && !this.#cancel.defaultPrevented;
      this.#cancel = undefined;
      if (!tail && !dialog.open) this.closed.emit();
      this.#native.update(count => count + 1);
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    inject(DestroyRef).onDestroy(() => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    });
    effect(() => {
      this.#native();
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
