import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { AlertCircle, GitCompare, GitMerge, X } from 'lucide-react';
import { comparisonSummary, type BranchDiffLoad } from '../utils/branch-diff';
import { WorkingTreeBranchDiffList } from './BranchDiffList';

/** History 顶部对比栏的状态；页面持有，本组件只做展示与转发。 */
export interface HistoryCompareState {
  /** 拿来和当前分支对比的那条分支 */
  readonly branchId: string;
  readonly comparison: BranchDiffLoad<BranchComparison>;
}

interface WorkingTreeHistoryCompareProps {
  /** 当前分支 */
  readonly activeBranch: string;
  /** 能拿来对比的分支（当前分支以外的） */
  readonly branches: readonly string[];
  /** 正在对比的那条与对比结果；没在对比时是 `null` */
  readonly compare: HistoryCompareState | null;
  /** 选了一条分支：页面读对比 */
  readonly onSelectBranch: (branchId: string) => void;
  /** 清除对比：回到历史 */
  readonly onClearRequested: () => void;
  /** 把这条分支合并进当前分支：页面打开合并对话框 */
  readonly onMergeRequest: (branchId: string) => void;
}

/**
 * History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，`history/compare.tsx`）。
 *
 * @remarks
 * 选一条分支，不切换就看它与当前分支差在哪（`compareBranches(当前分支, 那条分支)`）：每个字段读作
 * 「当前分支上的值 → 那条分支上的值」，新增是只在那条分支上有的实体，删除是只在当前分支上有的。
 * GitHub Desktop 在这里列 Behind / Ahead 的提交；这里的对比按实体给差异，所以列差异，底部同样给
 * 「Merge into 当前分支」。对比进行时页面收起提交列表，清除即回到历史。
 *
 * 选分支用原生 `<select>`：键盘、读屏与触屏都由浏览器给，不必自绘一个组合框。
 */
export function WorkingTreeHistoryCompare({
  activeBranch,
  branches,
  compare,
  onClearRequested,
  onMergeRequest,
  onSelectBranch
}: WorkingTreeHistoryCompareProps): React.JSX.Element {
  /** 选回占位项等于清除对比。 */
  const onSelect = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const branchId = event.target.value;
    if (branchId === '') onClearRequested();
    else onSelectBranch(branchId);
  };

  return (
    <>
      <div className='flex shrink-0 items-center gap-2 border-b px-3 py-2' style={{ borderColor: 'var(--gd-border)' }}>
        <GitCompare className='shrink-0' style={{ color: 'var(--gd-muted)' }} aria-hidden='true' size={14} />
        <select
          className='gd-input min-w-0 flex-1'
          disabled={branches.length === 0}
          onChange={onSelect}
          aria-label='Select branch to compare'
          data-testid='wt-compare-select'
          value={compare?.branchId ?? ''}
        >
          <option value=''>{branches.length === 0 ? 'No branches to compare' : 'Select branch to compare…'}</option>
          {branches.map(branchId => (
            <option key={branchId} value={branchId}>
              {branchId}
            </option>
          ))}
        </select>
        {compare !== null && (
          <button
            className='gd-icon-btn shrink-0'
            onClick={onClearRequested}
            aria-label='Clear branch comparison'
            data-testid='wt-compare-clear'
            title='Back to history'
            type='button'
          >
            <X size={14} />
          </button>
        )}
      </div>

      {compare !== null && (
        // 可读名不能与里面差异列表的滚动区同名：两个同名地标是 axe landmark-unique
        <section
          className='flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3'
          aria-label={`Compare ${activeBranch} with ${compare.branchId}`}
          data-testid='wt-compare-view'
        >
          <div className='text-xs' aria-live='polite'>
            {compare.comparison.phase === 'loading' && (
              <p style={{ color: 'var(--gd-muted)' }} data-testid='wt-compare-loading'>
                Comparing…
              </p>
            )}
            {compare.comparison.phase === 'error' && (
              <p
                className='flex items-center gap-2'
                style={{ color: 'var(--gd-del-fg)' }}
                data-testid='wt-compare-error'
              >
                <AlertCircle className='shrink-0' aria-hidden='true' size={13} />
                {compare.comparison.message}
              </p>
            )}
            {compare.comparison.phase === 'success' && (
              <p data-testid='wt-compare-summary'>{comparisonSummary(compare.comparison.value)}</p>
            )}
          </div>

          {compare.comparison.phase === 'success' && compare.comparison.value.entries.length > 0 && (
            <>
              <WorkingTreeBranchDiffList
                emptyText=''
                entries={compare.comparison.value.entries}
                label={`Differences between ${activeBranch} and ${compare.branchId}`}
                target={activeBranch}
              />
              <p className='text-xs' style={{ color: 'var(--gd-muted)' }}>
                Each field reads {activeBranch} → {compare.branchId}.
              </p>
            </>
          )}

          <button
            className='gd-btn-primary mt-1 self-start'
            onClick={() => onMergeRequest(compare.branchId)}
            data-testid='wt-compare-merge'
            type='button'
          >
            <GitMerge size={13} />
            Merge into <strong>{activeBranch}</strong>
          </button>
        </section>
      )}
    </>
  );
}
