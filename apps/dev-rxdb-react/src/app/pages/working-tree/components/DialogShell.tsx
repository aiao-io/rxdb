import { useEffect, useRef, type ReactNode } from 'react';
import { restoreFocus, trapTabKey } from '../utils/focus-trap';

interface WorkingTreeDialogShellProps {
  /** 面板的 `data-testid` */
  readonly testId: string;
  /** 标题元素的 id：对话框的可读名 */
  readonly labelledBy: string;
  readonly onCloseRequested: () => void;
  readonly children: ReactNode;
}

/**
 * 模态对话框外壳：合并对话框与 Switch branch 对话框共用（GitHub Desktop 对话框形态：白面板圆角描边、半透明背板）。
 *
 * @remarks
 * 背板与面板是**兄弟**节点。背板是 `role="button"`（点它关闭），而按钮的子孙不许可聚焦——
 * 背板包着面板就是 axe 的 `nested-interactive` 违规。打开时焦点移进面板，面板里任意处按 Escape 关闭。
 *
 * 面板是焦点陷阱：Tab / Shift+Tab 在面板里首尾回绕，键盘走不到背板与页面上（见 `trapTabKey`）。
 * 关闭时焦点还给打开前持有它的元素，但只在它还在文档里时还：从分支下拉打开的（底部的合并入口、点行切分支），
 * 对话框关闭时那个下拉早已收起，焦点就留给浏览器；从 History 对比里的「Merge into」打开的，按钮还在，焦点还给它
 * （见 `restoreFocus`）。
 *
 * 只认面板 DOM 里发出的按键（Escape 与 Tab 都是）：React 事件沿组件树冒泡，面板里的子组件经 portal
 * 开的对话框里按的键也会冒到这里，那一下只该作用于它自己。
 */
export function WorkingTreeDialogShell({
  children,
  labelledBy,
  onCloseRequested,
  testId
}: WorkingTreeDialogShellProps): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null);

  // 焦点移进面板之前先记下此前持有焦点的元素，关闭时还给它
  useEffect(() => {
    const opener = document.activeElement;
    panel.current?.focus();
    return () => restoreFocus(opener);
  }, []);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center p-3'>
      <div
        className='absolute inset-0 bg-black/50'
        onClick={onCloseRequested}
        onKeyDown={event => {
          if (event.key === 'Escape' || event.key === 'Enter') onCloseRequested();
        }}
        aria-label='Close dialog'
        role='button'
        tabIndex={0}
      />
      <div
        className='relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-md border border-[var(--gd-border)] p-5 shadow-2xl outline-none'
        style={{ background: 'var(--gd-panel)' }}
        ref={panel}
        onKeyDown={event => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (event.key === 'Escape') onCloseRequested();
          trapTabKey(event.currentTarget, event);
        }}
        aria-labelledby={labelledBy}
        aria-modal={true}
        data-testid={testId}
        role='dialog'
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
