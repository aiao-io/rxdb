import type { CommitLogEntry, CommitLogPage, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { History } from 'lucide-react';
import { gdAvatarColor, gdAvatarInitial, gdRelativeTime } from '../utils/gd';
import type { WorkingTreeContextMenuRequest } from './ChangesList';

interface WorkingTreeHistoryListProps {
  readonly commitsState: WorkingTreeQueryState<CommitLogPage>;
  readonly selectedCommitId: string | null;
  readonly onSelectEntry: (entry: CommitLogEntry) => void;
  /** 行上右键；页面按条目拼菜单（复制 / 恢复）。 */
  readonly onMenuRequest: (request: WorkingTreeContextMenuRequest<CommitLogEntry>) => void;
}

/**
 * 「历史记录」标签页的提交列表，模仿 GitHub Desktop 的 History 列表。
 *
 * @remarks
 * 第一行是提交标题，第二行是作者头像、作者与时间；选择后右侧显示文件与补丁。
 * 行可选中，右栏详情区跟随选中项，选中行是 3px 蓝左边条 + 浅蓝底（`.gd-row`）。
 * GitHub Desktop 的历史行上没有「恢复」按钮（右栏详情区也没有），恢复入口只在
 * 行的右键菜单里——行因此回到与变更列表同一种形态：`role="button"` 的 div + Enter。
 * 基线提交（`baseline` / `branch_baseline`）不可恢复——恢复它们的语义是把内容
 * 写回工作树，而基线不是用户提交。
 */
export function WorkingTreeHistoryList({
  commitsState,
  selectedCommitId,
  onMenuRequest,
  onSelectEntry
}: WorkingTreeHistoryListProps): React.JSX.Element {
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='min-h-0 flex-1 overflow-y-auto' aria-live='polite' data-testid='wt-commits-result'>
        {/* 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only */}
        <span className='sr-only' data-testid='wt-commits-phase'>
          {commitsState.phase}
        </span>
        {commitsState.phase === 'empty' ?
          <div className='gd-empty py-10 text-xs'>
            <History className='text-[var(--gd-line-num)]' size={28} />
            <p>No commits on this branch yet</p>
          </div>
        : commitsState.phase === 'success' ?
          <ol data-testid='wt-commits-list'>
            {commitsState.value.entries.map(entry => (
              <li key={entry.commitId}>
                <div
                  className={`gd-row gd-history-row ${selectedCommitId === entry.commitId ? 'gd-row-selected' : ''}`}
                  aria-current={selectedCommitId === entry.commitId ? 'true' : undefined}
                  data-commit-id={entry.commitId}
                  onClick={() => onSelectEntry(entry)}
                  onContextMenu={event => onMenuRequest({ target: entry, event })}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onSelectEntry(entry);
                  }}
                  data-testid='wt-commit-item'
                  role='button'
                  tabIndex={0}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='min-w-0 truncate text-[13px] font-semibold' title={entry.message}>
                      {entry.message.split('\n', 1)[0]}
                    </div>
                    <div className='mt-1 flex items-center gap-1.5 text-[11px]' style={{ color: 'var(--gd-muted)' }}>
                      <span
                        className='gd-avatar text-[9px]'
                        style={{ background: gdAvatarColor(entry.authorId ?? '?'), height: 14, width: 14 }}
                      >
                        {gdAvatarInitial(entry.authorId ?? '?')}
                      </span>
                      <span className='min-w-0 truncate'>{entry.authorId ?? 'No author'}</span>
                      <span>·</span>
                      {/* GitHub Desktop 的 TimeAgo：相对时间展示，完整时间戳留在悬停 title */}
                      <span className='min-w-0 truncate' title={entry.createdAt.toLocaleString()}>
                        {gdRelativeTime(entry.createdAt)}
                      </span>
                      {entry.kind === 'baseline' || entry.kind === 'branch_baseline' ?
                        <span className='shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'>
                          Baseline
                        </span>
                      : null}
                      {entry.parentIds.length > 1 ?
                        <span className='shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'>
                          Merge
                        </span>
                      : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        : null}
      </div>
    </div>
  );
}
