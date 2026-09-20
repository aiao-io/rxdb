import type { MergeStrategy } from '@aiao/rxdb';
import { AlertCircle, ChevronRight, GitMerge } from 'lucide-react';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

interface WorkingTreeMergeDialogProps {
  readonly dialog: MergeDialogState | null;
  readonly activeBranch: string;
  readonly error: string | null;
  readonly onCloseRequested: () => void;
  readonly onStrategyChange: (strategy: MergeStrategy) => void;
  readonly onDeleteSourceChange: (value: boolean) => void;
  readonly onConfirm: () => void;
}

/**
 * 合并对话框（从旧页面整体搬出，行为不变，视觉改为 GitHub Desktop 对话框形态：
 * 白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 背板是 `role="button"` + `tabindex="0"` 的 div：点背板或按 Escape 关闭。
 * 不用 `<dialog>` 元素——Angular 端旧实现的焦点与扫读行为已被 a11y 用例验证过，
 * 换容器形态等于把那条用例的结论作废重验。
 */
export function WorkingTreeMergeDialog({
  activeBranch,
  dialog,
  error,
  onCloseRequested,
  onConfirm,
  onDeleteSourceChange,
  onStrategyChange
}: WorkingTreeMergeDialogProps): React.JSX.Element | null {
  if (dialog === null) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'
      onClick={onCloseRequested}
      onKeyDown={event => {
        if (event.key === 'Escape') onCloseRequested();
      }}
      aria-label='Close dialog'
      role='button'
      tabIndex={0}
    >
      <div
        className='w-full max-w-md rounded-md border border-[var(--gd-border)] p-5 shadow-2xl'
        style={{ background: 'var(--gd-panel)' }}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        aria-modal={true}
        data-testid='wt-merge-dialog'
        role='dialog'
      >
        <div className='mb-4 flex items-center gap-2'>
          <GitMerge className='text-[var(--gd-accent)]' size={18} />
          <h2 className='text-[15px] font-semibold'>Merge branch</h2>
        </div>

        <div
          className='mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm'
          style={{ background: 'var(--gd-bg)' }}
        >
          <span className='min-w-0 truncate font-mono font-medium text-amber-700'>{dialog.sourceBranchId}</span>
          <ChevronRight className='shrink-0' style={{ color: 'var(--gd-muted)' }} size={14} />
          <span className='min-w-0 truncate font-mono font-medium text-green-700'>{activeBranch}</span>
        </div>

        <div className='mb-4'>
          <span className='mb-1.5 block text-sm font-medium'>Merge strategy</span>
          <div className='flex gap-2'>
            <button
              className='flex-1 rounded border px-3 py-2 text-left text-sm transition-colors'
              style={{
                background: dialog.strategy === 'squash' ? 'var(--gd-selected)' : 'var(--gd-panel)',
                borderColor: dialog.strategy === 'squash' ? 'var(--gd-accent)' : 'var(--gd-border)'
              }}
              onClick={() => onStrategyChange('squash')}
              data-testid='wt-merge-strategy-squash'
              type='button'
            >
              <div className='font-medium'>Squash</div>
              <div className='mt-0.5 text-xs' style={{ color: 'var(--gd-muted)' }}>
                Squash into a minimal change set, filtering ghost operations
              </div>
            </button>
            <button
              className='flex-1 rounded border px-3 py-2 text-left text-sm transition-colors'
              style={{
                background: dialog.strategy === 'normal' ? 'var(--gd-selected)' : 'var(--gd-panel)',
                borderColor: dialog.strategy === 'normal' ? 'var(--gd-accent)' : 'var(--gd-border)'
              }}
              onClick={() => onStrategyChange('normal')}
              data-testid='wt-merge-strategy-normal'
              type='button'
            >
              <div className='font-medium'>Normal</div>
              <div className='mt-0.5 text-xs' style={{ color: 'var(--gd-muted)' }}>
                Apply each change separately, keeping individual change records
              </div>
            </button>
          </div>
        </div>

        <label className='mb-2 flex cursor-pointer items-center gap-3'>
          <input
            className='checkbox checkbox-sm'
            checked={dialog.deleteSource}
            onChange={event => onDeleteSourceChange(event.target.checked)}
            data-testid='wt-merge-delete-source'
            type='checkbox'
          />
          <span className='text-sm'>
            Delete source branch after merging
            <code className='text-xs opacity-70'>{dialog.sourceBranchId}</code>
          </span>
        </label>

        <p className='mb-4 text-xs' style={{ color: 'var(--gd-muted)' }}>
          The result lands in the <strong>working tree</strong> of {activeBranch} (like{' '}
          <code>git merge --no-commit</code>) and enters history only after a commit.
        </p>

        {error !== null && (
          <div
            className='mb-4 flex items-center gap-2 rounded border border-red-300 p-2 text-sm text-red-700'
            data-testid='wt-merge-error'
          >
            <AlertCircle className='shrink-0' size={15} />
            {error}
          </div>
        )}

        <div className='flex justify-end gap-2'>
          <button className='gd-btn-secondary' onClick={onCloseRequested} data-testid='wt-merge-cancel' type='button'>
            Cancel
          </button>
          <button className='gd-btn-primary' onClick={onConfirm} data-testid='wt-merge-confirm' type='button'>
            <GitMerge size={13} />
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
