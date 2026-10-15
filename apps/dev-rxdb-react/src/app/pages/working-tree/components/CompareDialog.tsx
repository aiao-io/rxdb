import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { AlertCircle, ChevronRight, GitCompare } from 'lucide-react';
import { comparisonSummary, type BranchDiffLoad } from '../utils/branch-diff';
import { WorkingTreeBranchDiffList } from './BranchDiffList';
import { WorkingTreeDialogShell } from './DialogShell';

/** 对比对话框的状态；页面持有，本组件只做展示。 */
export interface CompareDialogState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

interface WorkingTreeCompareDialogProps {
  readonly dialog: CompareDialogState | null;
  readonly activeBranch: string;
  readonly onCloseRequested: () => void;
}

/**
 * 分支对比对话框：不切换就看另一条分支与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）。
 *
 * @remarks
 * 每个字段读作「当前分支上的值 → 那条分支上的值」；新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 */
export function WorkingTreeCompareDialog({
  activeBranch,
  dialog,
  onCloseRequested
}: WorkingTreeCompareDialogProps): React.JSX.Element | null {
  if (dialog === null) return null;
  const { comparison } = dialog;

  return (
    <WorkingTreeDialogShell
      labelledBy='wt-compare-title'
      onCloseRequested={onCloseRequested}
      testId='wt-compare-dialog'
    >
      <div className='mb-4 flex items-center gap-2'>
        <GitCompare className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-compare-title'>
          Compare branches
        </h2>
      </div>

      <div
        className='mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm'
        style={{ background: 'var(--gd-bg)' }}
      >
        <span className='min-w-0 truncate font-mono font-medium text-green-700'>{activeBranch}</span>
        <ChevronRight className='shrink-0' style={{ color: 'var(--gd-muted)' }} aria-hidden='true' size={14} />
        <span className='min-w-0 truncate font-mono font-medium text-amber-700'>{dialog.branchId}</span>
      </div>

      <div className='mb-2 text-xs' aria-live='polite'>
        {comparison.phase === 'loading' && (
          <p style={{ color: 'var(--gd-muted)' }} data-testid='wt-compare-loading'>
            Comparing…
          </p>
        )}
        {comparison.phase === 'error' && (
          <p className='flex items-center gap-2' style={{ color: 'var(--gd-del-fg)' }} data-testid='wt-compare-error'>
            <AlertCircle className='shrink-0' aria-hidden='true' size={13} />
            {comparison.message}
          </p>
        )}
        {comparison.phase === 'success' && (
          <p data-testid='wt-compare-summary'>{comparisonSummary(comparison.value)}</p>
        )}
      </div>

      {comparison.phase === 'success' && comparison.value.entries.length > 0 && (
        <>
          <WorkingTreeBranchDiffList
            emptyText=''
            entries={comparison.value.entries}
            label={`Differences between ${activeBranch} and ${dialog.branchId}`}
            target={activeBranch}
          />
          <p className='mt-2 text-xs' style={{ color: 'var(--gd-muted)' }}>
            Each field reads {activeBranch} → {dialog.branchId}.
          </p>
        </>
      )}

      <div className='mt-4 flex justify-end'>
        <button className='gd-btn-secondary' onClick={onCloseRequested} data-testid='wt-compare-close' type='button'>
          Close
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
