import { toValue, watch, type MaybeRefOrGetter, type ShallowRef } from 'vue';

/**
 * 把受控的开关同步到模板 ref 指向的原生 `<dialog>` 的模态状态；原生关闭（Esc）通过 `onClose` 回写。
 * DOM 与开关在渲染之后（post flush）同步，挂载时已打开的对话框也会被打开。
 * @param dialog - `useTemplateRef` 取得的 `<dialog>` 元素 ref。
 * @param open - 是否打开。
 * @param onClose - 对话框被原生关闭时的回调，需要是稳定的函数。
 */
export function useModalDialog(
  dialog: Readonly<ShallowRef<HTMLDialogElement | null>>,
  open: MaybeRefOrGetter<boolean>,
  onClose: () => void
): void {
  watch(
    [dialog, () => toValue(open)],
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
      // Esc 先同步触发 cancel，原生 close 事件要晚十几毫秒才到：关闭在 cancel 时立刻回写，
      // 否则这段时间里应用再次请求打开（如快捷键）会被迟到的 close 事件覆盖。
      // close 只在对话框确实处于关闭状态时才回写（程序化 close() 与不经 cancel 的关闭仍走这里）。
      const onNativeClose = (): void => {
        if (!element.open) onClose();
      };
      element.addEventListener('cancel', onClose);
      element.addEventListener('close', onNativeClose);
      onCleanup(() => {
        element.removeEventListener('cancel', onClose);
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
