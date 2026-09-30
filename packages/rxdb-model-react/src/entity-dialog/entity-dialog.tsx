/**
 * @fileoverview 对话框外壳组件（Angular `EntityDialogComponent` 的 React 移植）。
 *
 * 语义与 Angular 侧一致：
 * - 对话框内（{@link Dialog} 语境）渲染标题栏（拖拽手柄 + 全屏切换 + 关闭）与八个边缘缩放手柄；
 * - 对话框外只做纯投影渲染（无标题栏、无手柄）；
 * - 全屏切换直接改写面板（`DialogContext.paneRef`）的内联样式；
 * - 关闭顺序：先 `onCloseRequested`，再关闭 `DialogRef`（此处为 `DialogContext.close`）。
 *
 * CDK 差异：Angular 用 `CdkDrag` 拖拽面板，本实现用标题栏 pointer 手势驱动面板
 * left/top —— 对外可观察行为一致（拖标题栏移动对话框，全屏时禁止拖拽）。
 *
 * @module entity-dialog
 */
import { useContext, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { DialogContext } from '../dialog/dialog';
import './entity-dialog.css';

/** 边缘缩放方向（n/s/e/w 与四个角）。 */
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** {@link EntityDialog} 的 props。 */
export interface EntityDialogProps {
  /** 对话框标题。 */
  title: string;
  /** 投影内容。 */
  children?: ReactNode;
  /** 关闭请求（标题栏关闭按钮触发；遮罩点击 / Escape 直接关闭对话框，不走这里 —— 与 CDK 一致）。 */
  onCloseRequested?: () => void;
}

/**
 * 对话框外壳组件：标题栏（拖拽 / 全屏 / 关闭）+ 八向缩放 + 内容投影。
 *
 * @remarks
 * 在 {@link Dialog} 内使用时从 {@link DialogContext} 拿到面板引用；
 * 独立使用（无对话框语境）时仅渲染 `children`，与 Angular 的
 * 「非 DIALOG 语境只渲染投影内容」一致。
 */
export function EntityDialog({ title, children, onCloseRequested }: EntityDialogProps): JSX.Element {
  const dialog = useContext(DialogContext);
  const isInDialog = dialog !== null;
  const ownPaneRef = useRef<HTMLDivElement | null>(null);
  const paneRef = dialog?.paneRef ?? ownPaneRef;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(isFullscreen);
  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  const resizingRef = useRef(false);
  const savedPaneStateRef = useRef<{ left: string; top: string; width: string; height: string } | null>(null);

  /** 关闭：先通知宿主，再关闭对话框（Angular 侧 `closeRequested.emit()` → `dialogRef.close()`）。 */
  const close = (): void => {
    onCloseRequested?.();
    dialog?.close();
  };

  /** 全屏切换：写面板内联样式并可还原（Angular 侧 `toggleFullscreen` 同语义）。 */
  const toggleFullscreen = (): void => {
    const fullscreen = !isFullscreenRef.current;
    setIsFullscreen(fullscreen);
    const pane = paneRef.current;
    if (!pane) return;

    if (fullscreen) {
      savedPaneStateRef.current = {
        left: pane.style.left,
        top: pane.style.top,
        width: pane.style.width,
        height: pane.style.height
      };
      pane.style.left = '0';
      pane.style.top = '0';
      pane.style.width = '100vw';
      pane.style.height = '100vh';
    } else {
      const saved = savedPaneStateRef.current;
      if (saved) {
        pane.style.left = saved.left;
        pane.style.top = saved.top;
        pane.style.width = saved.width;
        pane.style.height = saved.height;
        savedPaneStateRef.current = null;
      }
    }
  };

  /** 标题栏拖拽（替代 CdkDrag）：按住标题移动面板 left/top，全屏时禁用。 */
  const onTitlePointerDown = (event: React.PointerEvent): void => {
    const pane = paneRef.current;
    if (!pane || isFullscreenRef.current) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = parseFloat(pane.style.left) || 0;
    const startTop = parseFloat(pane.style.top) || 0;
    const onMove = (moveEvent: MouseEvent): void => {
      pane.style.left = `${startLeft + moveEvent.clientX - startX}px`;
      pane.style.top = `${startTop + moveEvent.clientY - startY}px`;
    };
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** 边缘缩放（Angular 侧 `startResize` 原样移植）。 */
  const startResize = (event: React.MouseEvent, dir: ResizeDirection): void => {
    const pane = paneRef.current;
    if (!pane || resizingRef.current || isFullscreenRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = true;
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = pane.offsetWidth;
    const startH = pane.offsetHeight;
    const startL = parseFloat(pane.style.left) || 0;
    const startT = parseFloat(pane.style.top) || 0;
    const minW = 400;
    const minH = 300;

    const onMove = (moveEvent: MouseEvent): void => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (dir.includes('e')) pane.style.width = `${Math.max(minW, startW + dx)}px`;
      if (dir.includes('w')) {
        const w = Math.max(minW, startW - dx);
        pane.style.width = `${w}px`;
        pane.style.left = `${startL + startW - w}px`;
      }
      if (dir.includes('s')) pane.style.height = `${Math.max(minH, startH + dy)}px`;
      if (dir.includes('n')) {
        const h = Math.max(minH, startH - dy);
        pane.style.height = `${h}px`;
        pane.style.top = `${startT + startH - h}px`;
      }
    };
    const onUp = (): void => {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className='rxdb-entity-dialog'>
      {isInDialog && (
        <>
          <div className='resize-handle resize-n' onMouseDown={event => startResize(event, 'n')} />
          <div className='resize-handle resize-s' onMouseDown={event => startResize(event, 's')} />
          <div className='resize-handle resize-e' onMouseDown={event => startResize(event, 'e')} />
          <div className='resize-handle resize-w' onMouseDown={event => startResize(event, 'w')} />
          <div className='resize-handle resize-ne' onMouseDown={event => startResize(event, 'ne')} />
          <div className='resize-handle resize-nw' onMouseDown={event => startResize(event, 'nw')} />
          <div className='resize-handle resize-se' onMouseDown={event => startResize(event, 'se')} />
          <div className='resize-handle resize-sw' onMouseDown={event => startResize(event, 'sw')} />

          {/* 标题栏（拖拽手柄 + 全屏切换 + 关闭） */}
          <div className='border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-2'>
            <span
              className='flex-1 cursor-grab text-base font-semibold select-none active:cursor-grabbing'
              onPointerDown={onTitlePointerDown}
            >
              {title}
            </span>
            <div className='flex items-center gap-1'>
              <button
                className='btn btn-ghost btn-xs btn-square'
                aria-label={isFullscreen ? '退出全屏' : '全屏'}
                type='button'
                onClick={toggleFullscreen}
              >
                {isFullscreen ?
                  <svg className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24'>
                    <path d='M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3' />
                  </svg>
                : <svg className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24'>
                    <path d='M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7' />
                  </svg>
                }
              </button>
              <button className='btn btn-ghost btn-xs btn-square' aria-label='关闭' type='button' onClick={close}>
                <svg className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='2' viewBox='0 0 24 24'>
                  <path d='M18 6 6 18M6 6l12 12' />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
      {children}
    </div>
  );
}
