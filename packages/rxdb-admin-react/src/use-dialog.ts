import { useEffect, useRef, type RefObject } from 'react';

/**
 * 把受控的开关同步到原生 `<dialog>` 的模态状态；原生关闭（Esc）通过 `onClose` 回写。
 * @param open - 是否打开。
 * @param onClose - 对话框被原生关闭时的回调。
 * @returns 绑定到 `<dialog>` 的 ref。
 */
export function useModalDialog(open: boolean, onClose: () => void): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Esc 先同步触发 cancel，原生 close 事件要晚十几毫秒才到：关闭在 cancel 时立刻回写，
    // 否则这段时间里应用再次请求打开（如快捷键）会被迟到的 close 事件覆盖。
    // close 只在对话框确实处于关闭状态时才回写（程序化 close() 与不经 cancel 的关闭仍走这里）。
    const onCancel = (): void => closeRef.current();
    const onClose = (): void => {
      if (!dialog.open) closeRef.current();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
    };
  }, []);

  return ref;
}

/**
 * 点击 `<dialog>` 自身（即 `::backdrop`）时关闭。
 * @param event - 点击事件。
 * @param close - 关闭动作。
 */
export function closeOnBackdrop(event: { target: unknown; currentTarget: unknown }, close: () => void): void {
  if (event.target === event.currentTarget) close();
}
