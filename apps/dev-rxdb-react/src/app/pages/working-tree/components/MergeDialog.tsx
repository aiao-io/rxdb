import type { MergeStrategy } from '@aiao/rxdb';
import type { MergePreview } from '@aiao/rxdb-plugin-history';
import clsx from 'clsx';
import { AlertCircle, ChevronRight, GitBranch, GitMerge } from 'lucide-react';
import { useState } from 'react';
import { mergePreviewSummary, type BranchDiffLoad } from '../utils/branch-diff';
import { WorkingTreeBranchDiffList } from './BranchDiffList';
import { WorkingTreeDialogShell } from './DialogShell';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  /** 要合并进当前分支的那条；从分支下拉底部打开时还没选，是 `null` */
  sourceBranchId: string | null;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

interface WorkingTreeMergeDialogProps {
  readonly dialog: MergeDialogState | null;
  readonly activeBranch: string;
  /** 能合并进来的分支（当前分支以外的） */
  readonly branches: readonly string[];
  /** 按当前策略读的合并预览；读失败不挡合并 */
  readonly preview: BranchDiffLoad<MergePreview>;
  readonly error: string | null;
  readonly onCloseRequested: () => void;
  /** 选了合并来源 */
  readonly onSourceChange: (sourceBranchId: string) => void;
  readonly onStrategyChange: (strategy: MergeStrategy) => void;
  readonly onDeleteSourceChange: (value: boolean) => void;
  readonly onConfirm: () => void;
}

/**
 * 合并对话框（GitHub Desktop 的「Merge into 当前分支」，`merge-choose-branch-dialog.tsx`；视觉为 GitHub Desktop
 * 对话框形态：白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 顶部是带筛选的分支列表，选一条作合并来源（从 History 的对比进来时已经选好）。选好之后显示预览（`previewMerge()`）：
 * 一句摘要（落多少条，跟着策略变）+ 将落的增删改，撞上当前分支分叉以来改动的条目带覆盖说明。预览是只读的参考，
 * 读失败只显示错误，合并照常可点；没选来源时合并置灰。外壳见 {@link WorkingTreeDialogShell}。
 *
 * 面板只在打开时挂载（见 `MergeDialogPanel`）：筛选词跟着面板走，对话框关掉即清空，下次打开不留上一次的筛选词。
 */
export function WorkingTreeMergeDialog({ dialog, ...props }: WorkingTreeMergeDialogProps): React.JSX.Element | null {
  if (dialog === null) return null;
  return <MergeDialogPanel dialog={dialog} {...props} />;
}

interface MergeDialogPanelProps extends Omit<WorkingTreeMergeDialogProps, 'dialog'> {
  readonly dialog: MergeDialogState;
}

/** 开着的合并对话框；分支名筛选（大小写不敏感的子串匹配）的状态归它。 */
function MergeDialogPanel({
  activeBranch,
  branches,
  dialog,
  error,
  onCloseRequested,
  onConfirm,
  onDeleteSourceChange,
  onSourceChange,
  onStrategyChange,
  preview
}: MergeDialogPanelProps): React.JSX.Element {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const filteredBranches = needle === '' ? branches : branches.filter(id => id.toLowerCase().includes(needle));
  const { sourceBranchId } = dialog;

  return (
    <WorkingTreeDialogShell labelledBy='wt-merge-title' onCloseRequested={onCloseRequested} testId='wt-merge-dialog'>
      <div className='mb-4 flex items-center gap-2'>
        <GitMerge className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-merge-title'>
          Merge into <strong>{activeBranch}</strong>
        </h2>
      </div>

      <div className='mb-4'>
        <input
          className='gd-input mb-2'
          onChange={event => setFilter(event.target.value)}
          aria-label='Filter branches'
          data-testid='wt-merge-branch-filter'
          placeholder='Filter'
          type='text'
          value={filter}
        />
        <ul
          className='max-h-40 overflow-y-auto rounded border border-[var(--gd-border)]'
          aria-label='Branches to merge'
          data-testid='wt-merge-branch-list'
        >
          {filteredBranches.map(branchId => (
            <li key={branchId}>
              <button
                className={clsx('gd-row flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', {
                  'gd-row-selected': branchId === sourceBranchId
                })}
                aria-current={branchId === sourceBranchId ? 'true' : undefined}
                data-branch-id={branchId}
                onClick={() => onSourceChange(branchId)}
                data-testid='wt-merge-branch-item'
                type='button'
              >
                <GitBranch className='shrink-0' aria-hidden='true' size={12} />
                <span className='min-w-0 flex-1 truncate font-mono'>{branchId}</span>
              </button>
            </li>
          ))}
          {filteredBranches.length === 0 && (
            <li className='px-3 py-2 text-center text-xs' style={{ color: 'var(--gd-muted)' }}>
              {branches.length === 0 ? 'No other branches to merge' : 'No matching branches'}
            </li>
          )}
        </ul>
      </div>

      {sourceBranchId !== null ?
        <>
          <div
            className='mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm'
            style={{ background: 'var(--gd-bg)' }}
          >
            <span className='min-w-0 truncate font-mono font-medium text-amber-700'>{sourceBranchId}</span>
            <ChevronRight className='shrink-0' style={{ color: 'var(--gd-muted)' }} aria-hidden='true' size={14} />
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

          <section className='mb-4' aria-labelledby='wt-merge-preview-title' data-testid='wt-merge-preview'>
            <h3 className='mb-1.5 text-sm font-medium' id='wt-merge-preview-title'>
              Preview
            </h3>
            <div className='mb-2 text-xs' aria-live='polite'>
              {preview.phase === 'loading' && (
                <p style={{ color: 'var(--gd-muted)' }} data-testid='wt-merge-preview-loading'>
                  Loading preview…
                </p>
              )}
              {preview.phase === 'error' && (
                <p
                  className='flex items-center gap-2'
                  style={{ color: 'var(--gd-del-fg)' }}
                  data-testid='wt-merge-preview-error'
                >
                  <AlertCircle className='shrink-0' aria-hidden='true' size={13} />
                  Preview unavailable: {preview.message}
                </p>
              )}
              {preview.phase === 'success' && (
                <p data-testid='wt-merge-preview-summary'>{mergePreviewSummary(preview.value)}</p>
              )}
            </div>
            {preview.phase === 'success' && preview.value.merged > 0 && (
              <WorkingTreeBranchDiffList
                emptyText={`These changes cancel out; nothing on ${activeBranch} changes.`}
                entries={preview.value.entries}
                label='Merge preview'
                target={activeBranch}
              />
            )}
          </section>

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
              <code className='text-xs opacity-70'>{sourceBranchId}</code>
            </span>
          </label>

          <p className='mb-4 text-xs' style={{ color: 'var(--gd-muted)' }}>
            The result lands in the <strong>working tree</strong> of {activeBranch} (like{' '}
            <code>git merge --no-commit</code>) and enters history only after a commit.
          </p>
        </>
      : <p className='mb-4 text-sm' style={{ color: 'var(--gd-muted)' }} data-testid='wt-merge-choose-hint'>
          Choose a branch to merge into {activeBranch}.
        </p>
      }

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
        <button
          className='gd-btn-primary'
          disabled={sourceBranchId === null}
          onClick={onConfirm}
          data-testid='wt-merge-confirm'
          type='button'
        >
          <GitMerge size={13} />
          Merge
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
