/**
 * @fileoverview 包内对话框原语 —— `@angular/cdk/dialog` 的 React 等价物。
 *
 * Angular 层用 CDK Dialog 承载实体详情（新建 / 编辑）与 M2M 选择对话框；
 * 本包不引入新的 UI 依赖，用 portal + 原生 DOM 手势实现同语义的对话框：
 *
 * - `createPortal` 渲染到 `document.body`，不受宿主 `overflow` 裁剪；
 * - 遮罩点击关闭（CDK `hasBackdrop` 默认语义）；
 * - Escape 关闭**栈顶**对话框（嵌套详情对话框只关最上层）；
 * - 打开时锁定 body 滚动、聚焦面板，关闭后还原焦点（CDK `restoreFocus` 语义）。
 *
 * @module dialog
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type JSX,
  type ReactNode,
  type RefObject
} from 'react';
import { createPortal } from 'react-dom';
import './dialog.css';

/** 对话框关闭栈：Escape 只作用于栈顶（最新打开的对话框）。 */
const dialogStack: Array<() => void> = [];

/** body 滚动锁深度计数：嵌套对话框共享一次锁定，全部关闭后才还原。 */
let scrollLockDepth = 0;

/** 进入滚动锁之前的 body overflow 值（第一层对话框打开时存档）。 */
let previousBodyOverflow = '';

/**
 * 对话框上下文。
 *
 * @remarks
 * `EntityDialog` 据此感知「是否在对话框内」（决定标题栏 / 缩放手柄 / 全屏按钮是否渲染），
 * 并通过 {@link DialogContextValue.close} 以 `'saved'` 等结果关闭对话框 ——
 * 与 Angular 侧 `DialogRef.close(result)` 的语义一致。
 */
export interface DialogContextValue {
  /** 对话框面板元素（全屏切换 / 拖拽 / 缩放直接写其内联样式，对应 CDK 的 `.cdk-overlay-pane`）。 */
  readonly paneRef: RefObject<HTMLDivElement | null>;
  /** 关闭对话框，携带可选结果（如 `'saved'`）。 */
  close: (result?: unknown) => void;
}

/** 对话框上下文（`Dialog` 内部提供；对话框外为 `null`）。 */
export const DialogContext = createContext<DialogContextValue | null>(null);

/** 读取最近的 {@link DialogContext}；不在对话框内时返回 `null`。 */
export const useDialogContext = (): DialogContextValue | null => useContext(DialogContext);

/** {@link Dialog} 的 props。 */
export interface DialogProps {
  /** 对话框是否打开；`false` 时不渲染任何内容。 */
  open: boolean;
  /** 关闭回调：Escape / 遮罩点击 / 内容方 `close(result)` 三条路径都会走到这里。 */
  onClose: (result?: unknown) => void;
  /** 对话框内容。 */
  children: ReactNode;
  /** 面板宽度（如 `'720px'`）。 */
  width?: string;
  /** 面板最小宽度（如 `'400px'`）。 */
  minWidth?: string;
  /** 面板高度（如 `'80vh'`）。 */
  height?: string;
  /** 面板最小高度（如 `'300px'`）。 */
  minHeight?: string;
  /** 面板附加类名（对应 Angular 的 `panelClass`）。 */
  className?: string;
}

/**
 * 对话框原语：portal 渲染、遮罩点击关闭、Escape 关闭栈顶、滚动锁与焦点还原。
 *
 * @remarks
 * 面板定位为 `fixed` 居中（挂载时按实际尺寸计算 left/top），
 * 以便 `EntityDialog` 的全屏 / 拖拽 / 缩放直接改写面板内联样式 ——
 * 与 Angular 侧 `EntityDialogComponent.#initFixedPane()` 的模型一致。
 */
export function Dialog({
  open,
  onClose,
  children,
  width,
  minWidth,
  height,
  minHeight,
  className
}: DialogProps): JSX.Element | null {
  const paneRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback((result?: unknown): void => {
    onCloseRef.current(result);
  }, []);

  const contextValue = useMemo<DialogContextValue>(() => ({ paneRef, close }), [close]);

  useEffect(() => {
    if (!open) return;

    const pane = paneRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 面板 fixed 居中（Angular 侧 #initFixedPane 同语义）
    if (pane) {
      const rectW = pane.offsetWidth;
      const rectH = pane.offsetHeight;
      pane.style.position = 'fixed';
      pane.style.left = `${Math.round((window.innerWidth - rectW) / 2)}px`;
      pane.style.top = `${Math.round((window.innerHeight - rectH) / 2)}px`;
      pane.style.margin = '0';
      pane.style.maxWidth = 'none';
      pane.style.maxHeight = 'none';
      pane.focus();
    }

    const closeTopmost = (): void => {
      onCloseRef.current();
    };
    dialogStack.push(closeTopmost);

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dialogStack[dialogStack.length - 1] === closeTopmost) {
        event.preventDefault();
        closeTopmost();
      }
    };
    document.addEventListener('keydown', onKeydown);

    scrollLockDepth += 1;
    if (scrollLockDepth === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      const index = dialogStack.indexOf(closeTopmost);
      if (index >= 0) dialogStack.splice(index, 1);
      document.removeEventListener('keydown', onKeydown);
      scrollLockDepth -= 1;
      if (scrollLockDepth === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <DialogContext.Provider value={contextValue}>
      <div className='rxdb-dialog-backdrop' onClick={() => onCloseRef.current()}>
        <div
          ref={paneRef}
          className={['rxdb-dialog-pane', className].filter(Boolean).join(' ')}
          role='dialog'
          aria-modal='true'
          tabIndex={-1}
          style={{ width, minWidth, height, minHeight }}
          onClick={event => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body
  );
}
