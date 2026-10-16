import { useEffect, useRef, type ReactNode } from 'react';

interface WorkingTreeDialogShellProps {
  /** 面板的 `data-testid` */
  readonly testId: string;
  /** 标题元素的 id：对话框的可读名 */
  readonly labelledBy: string;
  readonly onCloseRequested: () => void;
  /** 面板宽度：`wide` 给放得下实体表格的只读检出位查看器 */
  readonly size?: 'default' | 'wide';
  readonly children: ReactNode;
}

/**
 * 模态对话框外壳：合并、对比与只读检出位查看器共用（GitHub Desktop 对话框形态：白面板圆角描边、半透明背板）。
 *
 * @remarks
 * 背板与面板是**兄弟**节点。背板是 `role="button"`（点它关闭），而按钮的子孙不许可聚焦——
 * 背板包着面板就是 axe 的 `nested-interactive` 违规。打开时焦点移进面板，面板里任意处按 Escape 关闭。
 * 只认面板 DOM 里发出的 Escape：React 事件沿组件树冒泡，查看器里实体列表经 portal 开的对话框按 Escape，
 * 也会冒到这里，那一下只该关它自己。
 */
export function WorkingTreeDialogShell({
  children,
  labelledBy,
  onCloseRequested,
  size = 'default',
  testId
}: WorkingTreeDialogShellProps): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
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
        className={`relative max-h-[90dvh] w-full ${size === 'wide' ? 'max-w-5xl' : 'max-w-lg'} overflow-y-auto rounded-md border border-[var(--gd-border)] p-5 shadow-2xl outline-none`}
        style={{ background: 'var(--gd-panel)' }}
        ref={panel}
        onKeyDown={event => {
          if (event.key === 'Escape' && panel.current?.contains(event.target as Node)) onCloseRequested();
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
