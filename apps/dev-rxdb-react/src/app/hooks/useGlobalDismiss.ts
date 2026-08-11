import { useEffect } from 'react';

/**
 * 浮层的全局关闭手势：点击浮层之外的任意位置，或按下 Escape。
 *
 * @param active - 浮层当前是否可见；`false` 时不挂任何监听
 * @param onDismiss - 关闭回调
 *
 * @remarks
 * P1-3：右键菜单原先只有自身的 `onClick={stopPropagation}`，**没有任何全局监听** ——
 * 菜单一旦弹出，点页面别处、按 Esc 都关不掉，只能再次右键或触发一个动作。
 *
 * 浮层内部的点击必须自行 `stopPropagation()`，否则会在动作执行前先被这里关掉。
 */
export function useGlobalDismiss(active: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!active) return;

    const onDocumentClick = (): void => onDismiss();
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [active, onDismiss]);
}
