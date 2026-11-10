import { shallowRef, toValue, watch, type MaybeRefOrGetter, type ShallowRef } from 'vue';

/**
 * 把受控的开关同步到模板 ref 指向的原生 `<dialog>` 的模态状态；原生关闭（Esc）通过 `onClose` 回写。
 * DOM 与开关在渲染之后（post flush）同步，挂载时已打开的对话框也会被打开。
 *
 * @remarks
 * - Esc 先同步触发 `cancel`，原生 `close` 事件要晚十几毫秒才到：关闭在 `cancel` 时立刻回写，
 *   而紧跟在这次 `cancel` 之后的那个 `close` 只是它的尾声，不再回写——否则这段时间里应用再次请求打开
 *   （如快捷键）会被迟到的 `close` 覆盖。不经 `cancel` 的原生关闭（程序化 `close()`）仍由 `close` 回写。
 * - 「写回关闭」与「再次请求打开」落在同一轮里时，`open` 的 true → false → true 在 flush 前被折叠成没有变化，
 *   同步 watcher 不会触发。每次原生 `cancel` / `close` 都让同步 watcher 重新对账一次，
 *   于是原生已经关闭、而模型想要打开的对话框会被重新 `showModal()`。与 Angular `AdminModalDirective` 同一套语义。
 * @param dialog - `useTemplateRef` 取得的 `<dialog>` 元素 ref。
 * @param open - 是否打开。
 * @param onClose - 对话框被原生关闭时的回调，需要是稳定的函数。
 */
export function useModalDialog(
  dialog: Readonly<ShallowRef<HTMLDialogElement | null>>,
  open: MaybeRefOrGetter<boolean>,
  onClose: () => void
): void {
  const native = shallowRef(0);

  watch(
    [dialog, () => toValue(open), native],
    ([element, isOpen]) => {
      if (!element) return;
      if (isOpen && !element.open) element.showModal();
      if (!isOpen && element.open) element.close();
    },
    { flush: 'post' }
  );

  watch(
    dialog,
    (element, _previous, onCleanup) => {
      if (!element) return;
      // 最近一次还没等到 close 的 cancel（Esc）；被 preventDefault 的 cancel 不会有 close
      let cancel: Event | undefined;
      const onCancel = (event: Event): void => {
        cancel = event;
        onClose();
        native.value += 1;
      };
      const onNativeClose = (): void => {
        const tail = cancel !== undefined && !cancel.defaultPrevented;
        cancel = undefined;
        if (!tail && !element.open) onClose();
        native.value += 1;
      };
      element.addEventListener('cancel', onCancel);
      element.addEventListener('close', onNativeClose);
      onCleanup(() => {
        element.removeEventListener('cancel', onCancel);
        element.removeEventListener('close', onNativeClose);
      });
    },
    { flush: 'post' }
  );
}

/**
 * 点击 `<dialog>` 自身（即 `::backdrop`）时关闭。
 * @param event - 点击事件。
 * @param close - 关闭动作。
 */
export function closeOnBackdrop(event: { target: unknown; currentTarget: unknown }, close: () => void): void {
  if (event.target === event.currentTarget) close();
}
