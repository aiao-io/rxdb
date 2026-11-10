import { useEffect, useReducer, useRef, type RefObject } from 'react';

/**
 * 把受控的开关同步到原生 `<dialog>` 的模态状态；原生关闭（Esc）通过 `onClose` 回写。
 *
 * @remarks
 * - Esc 先同步触发 `cancel`，原生 `close` 事件要晚十几毫秒才到：关闭在 `cancel` 时立刻回写，
 *   而紧跟在这次 `cancel` 之后的那个 `close` 只是它的尾声，不再回写——否则这段时间里应用再次请求打开
 *   （如快捷键）会被迟到的 `close` 覆盖。不经 `cancel` 的原生关闭（程序化 `close()`）仍由 `close` 回写。
 * - 「写回关闭」与「再次请求打开」落在同一轮里时，`open` 的 true → false → true 被批处理折叠成没有变化，
 *   同步 effect 不会重跑。每次原生 `cancel` / `close` 都让同步 effect 重新对账一次，
 *   于是原生已经关闭、而模型想要打开的对话框会被重新 `showModal()`。与 Angular `AdminModalDirective` 同一套语义。
 * @param open - 是否打开。
 * @param onClose - 对话框被原生关闭时的回调。
 * @returns 绑定到 `<dialog>` 的 ref。
 */
export function useModalDialog(open: boolean, onClose: () => void): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const [native, nativeChanged] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, native]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // 最近一次还没等到 close 的 cancel（Esc）；被 preventDefault 的 cancel 不会有 close
    let cancel: Event | undefined;
    const onCancel = (event: Event): void => {
      cancel = event;
      closeRef.current();
      nativeChanged();
    };
    const onNativeClose = (): void => {
      const tail = cancel !== undefined && !cancel.defaultPrevented;
      cancel = undefined;
      if (!tail && !dialog.open) closeRef.current();
      nativeChanged();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onNativeClose);
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
