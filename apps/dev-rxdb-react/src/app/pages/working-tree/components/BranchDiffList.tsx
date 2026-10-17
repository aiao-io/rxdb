import type { BranchDiffEntry, MergePreviewEntry } from '@aiao/rxdb-plugin-history';
import { AlertTriangle } from 'lucide-react';
import { createElement } from 'react';
import { branchDiffRow } from '../utils/branch-diff';
import { gdOpColor, gdOpIcon, gdOpLabel, gdPathColor } from '../utils/gd';

interface WorkingTreeBranchDiffListProps {
  /** `compareBranches()` 或 `previewMerge()` 的条目 */
  readonly entries: readonly (BranchDiffEntry | MergePreviewEntry)[];
  /** 合并的目标分支（当前分支）：覆盖说明里点名 */
  readonly target: string;
  /** 滚动区的可读名 */
  readonly label: string;
  /** 没有条目时的说明 */
  readonly emptyText: string;
}

/**
 * 分支对比与合并预览共用的差异列表。
 *
 * @remarks
 * 一行一个实体：状态图标（装饰；读屏读旁边 sr-only 的状态名）+ 路径，下面逐字段「旧值 → 新值」；
 * 预览条目撞上目标分支的改动时再加一行覆盖说明。条目多时只能滚动查看，滚动区本身要能被键盘聚焦
 * （axe `scrollable-region-focusable`）。
 */
export function WorkingTreeBranchDiffList({
  emptyText,
  entries,
  label,
  target
}: WorkingTreeBranchDiffListProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <p className='py-3 text-center text-xs' style={{ color: 'var(--gd-muted)' }} data-testid='wt-branch-diff-empty'>
        {emptyText}
      </p>
    );
  }

  return (
    <div
      className='max-h-64 overflow-y-auto rounded border border-[var(--gd-border)] focus-visible:outline-2 focus-visible:outline-[var(--gd-accent)]'
      aria-label={label}
      role='region'
      tabIndex={0}
    >
      <ul data-testid='wt-branch-diff-list'>
        {entries
          .map(entry => branchDiffRow(entry, target))
          .map(row => (
            <li
              className='border-b border-[var(--gd-border)] px-3 py-2 last:border-b-0'
              key={row.key}
              data-testid='wt-branch-diff-item'
            >
              <div className='flex min-w-0 items-center gap-2'>
                {createElement(gdOpIcon(row.operation), {
                  'aria-hidden': true,
                  className: 'shrink-0',
                  size: 14,
                  style: { color: gdOpColor(row.operation) }
                })}
                <span className='sr-only'>{gdOpLabel(row.operation)}</span>
                <span
                  className='min-w-0 truncate font-mono text-xs'
                  style={{ color: gdPathColor(row.operation) }}
                  title={row.path}
                >
                  {row.path}
                </span>
              </div>
              {row.fields.length > 0 && (
                <ul className='mt-1 space-y-0.5 pl-6 font-mono text-xs'>
                  {row.fields.map(field => (
                    <li className='break-all' key={field.key}>
                      <span style={{ color: 'var(--gd-muted)' }}>{field.key}:</span> {field.before}
                      <span aria-hidden='true'> → </span>
                      <span className='sr-only'> to </span>
                      {field.after}
                    </li>
                  ))}
                </ul>
              )}
              {row.conflict !== null && (
                <p
                  className='mt-1 flex items-start gap-1.5 pl-6 text-xs'
                  style={{ color: 'var(--gd-warn-fg)' }}
                  data-testid='wt-branch-diff-conflict'
                >
                  <AlertTriangle className='mt-px shrink-0' aria-hidden='true' size={12} />
                  {row.conflict}
                </p>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}
