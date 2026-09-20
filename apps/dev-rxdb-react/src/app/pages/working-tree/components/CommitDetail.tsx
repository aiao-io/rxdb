import type { CommitChangeSetPage, CommitLogEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { ChevronDown, ChevronUp, Copy, GitCommitHorizontal } from 'lucide-react';
import { createElement, useEffect, useRef, useState } from 'react';
import { startDragResize } from '../utils/drag';
import {
  gdAvatarColor,
  gdAvatarInitial,
  gdEntryPath,
  gdOpColor,
  gdOpIcon,
  gdPathColor,
  gdTableName
} from '../utils/gd';
import { WorkingTreeDiffViewer } from './DiffViewer';

/** 一个变更单元的选中键：同一 commit 里的单元也互不相同。 */
const changeUnitKey = (unit: CommitChangeSetPage['entries'][number]): string =>
  `${unit.unitId}:${unit.namespace}:${unit.entity}:${unit.entityId}`;

interface WorkingTreeCommitDetailProps {
  readonly commit: CommitLogEntry | null;
  readonly changesState: WorkingTreeQueryState<CommitChangeSetPage>;
}

/**
 * 右栏的提交详情，对应 GitHub Desktop 历史里选中提交后的右侧视图。
 *
 * @remarks
 * 提交元信息下方是文件列表与逐字段差异。`commitChanges()` 返回不可变变更单元，
 * 补丁字段与未提交 diff 同形，因此共用查看器；`diff()` 本身仍只比较 HEAD 和工作树。
 *
 * 没有「恢复」按钮（GitHub Desktop 的详情区也没有）：恢复入口只在历史行的右键菜单里。
 * 标题行右端的折叠 chevron 收的是**附加基本信息**（描述 + 作者 / 时间 / sha 元数据行），
 * 下面的文件列表与差异栏始终可见。文件列表右缘有可拖分隔条（GitHub Desktop 的同款可拖宽度）。
 */
export function WorkingTreeCommitDetail({ changesState, commit }: WorkingTreeCommitDetailProps): React.JSX.Element {
  /** SHA 的复制反馈；2s 后复位。 */
  const [copied, setCopied] = useState(false);
  /** 左栏里选中的变更单元键。 */
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null);
  /** 内容区折叠（GitHub Desktop 的 diff 折叠 chevron）。 */
  const [collapsed, setCollapsed] = useState(false);
  /** 文件列表宽度；右缘分隔条拖动调。 */
  const [filesWidth, setFilesWidth] = useState(280);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 换一个 commit 就清掉上一个的左栏选中与折叠态：两个 commit 的单元键可能撞上（都叫 u1）。
  // （Angular 参考实现的 effect；React 端是「storing information from previous renders」模式。）
  const [previousCommit, setPreviousCommit] = useState(commit);
  if (commit !== previousCommit) {
    setPreviousCommit(commit);
    setSelectedUnitKey(null);
    setCollapsed(false);
  }

  // 复制反馈的复位 timer：卸载时清掉。
  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    },
    []
  );

  /** 提交标题 = message 的第一行（GitHub Desktop 的大字标题位）。 */
  const title = commit?.message.split('\n', 1)[0] ?? '';
  /** 描述 = message 第一行之后的全部（GitHub Desktop 的灰色描述段）。 */
  const message = commit?.message ?? '';
  const newline = message.indexOf('\n');
  const description = newline === -1 ? '' : message.slice(newline + 1).replace(/^\n+/, '');

  /** 左栏当前选中的变更单元；没选中时回落到第一条（GitHub Desktop 默认展示第一个文件）。 */
  const entries = changesState.phase === 'success' || changesState.phase === 'empty' ? changesState.value.entries : [];
  const selectedUnit =
    selectedUnitKey !== null ?
      (entries.find(unit => changeUnitKey(unit) === selectedUnitKey) ?? null)
    : (entries[0] ?? null);

  const copySha = async (sha: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
    } catch {
      // 剪贴板不可用（非安全上下文等）：不假装成功
      return;
    }
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  /** 拖动文件列表右缘的分隔条调宽（公共拖拽样板，见 drag.ts）。 */
  const startFilesResize = (event: React.PointerEvent) => {
    startDragResize(event, {
      getWidth: () => filesWidth,
      setWidth: setFilesWidth,
      min: 140,
      max: 420
    });
  };

  if (commit === null) {
    return (
      <div className='gd-empty h-full text-sm'>
        <GitCommitHorizontal className='text-[var(--gd-line-num)]' size={40} />
        <p>Select a commit from the left to see its details</p>
      </div>
    );
  }

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='wt-commit-detail'>
      <div className='gd-commit-header shrink-0 px-4 py-2'>
        <div className='flex items-center gap-2'>
          <h2 className='min-w-0 flex-1 truncate text-[15px] font-semibold' title={title}>
            {title}
          </h2>
          {commit.kind === 'baseline' || commit.kind === 'branch_baseline' ?
            <span
              className='shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'
              style={{ color: 'var(--gd-muted)' }}
            >
              Baseline
            </span>
          : <span
              className='shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'
              style={{ color: 'var(--gd-muted)' }}
            >
              Commit
            </span>
          }
          {commit.parentIds.length > 1 && (
            <span
              className='shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]'
              style={{ color: 'var(--gd-muted)' }}
            >
              Merge
            </span>
          )}
          <button
            className='gd-icon-btn shrink-0'
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand details' : 'Collapse details'}
            title={collapsed ? 'Expand details' : 'Collapse details'}
            onClick={() => setCollapsed(value => !value)}
            data-testid='wt-detail-collapse'
            type='button'
          >
            {collapsed ?
              <ChevronDown size={15} />
            : <ChevronUp size={15} />}
          </button>
        </div>
        {!collapsed && (
          <>
            {description !== '' && (
              <p className='mt-1 text-sm whitespace-pre-wrap' style={{ color: 'var(--gd-muted)' }}>
                {description}
              </p>
            )}
            <div
              className='gd-commit-meta mt-1 flex items-center gap-2 text-xs'
              style={{ color: 'var(--gd-muted)' }}
              title={commit.createdAt.toLocaleString()}
            >
              <span
                className='gd-avatar text-[9px]'
                style={{ background: gdAvatarColor(commit.authorId ?? '?'), height: 18, width: 18 }}
              >
                {gdAvatarInitial(commit.authorId ?? '?')}
              </span>
              <span>{commit.authorId ?? '无作者'}</span>
              <span className='gd-commit-time'>committed on {commit.createdAt.toLocaleString()}</span>
              <span className='min-w-0 truncate font-mono text-[11px]' title={commit.commitId}>
                {commit.commitId.slice(0, 8)}
              </span>
              <button
                className='gd-btn-ghost shrink-0'
                onClick={() => void copySha(commit.commitId)}
                data-testid='wt-commit-copy'
                title='Copy commit ID'
                type='button'
              >
                <Copy size={12} />
                <span className='sr-only'>{copied ? 'Copied' : 'Copy commit ID'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 提交列表之外的文件列表与差异栏；始终可见，折叠只收上面的附加信息。 */}
      <div
        className='gd-history-layout min-h-0 flex-1 border-t'
        style={{ borderColor: 'var(--gd-border)' }}
        data-testid='wt-commit-changes'
      >
        {changesState.phase === 'success' || changesState.phase === 'empty' ?
          <>
            <div
              className='gd-history-files'
              style={{ '--gd-files-w': `${filesWidth}px` } as React.CSSProperties}
              data-testid='wt-history-files'
            >
              <div className='gd-files-count'>{changesState.value.entries.length} changed files</div>
              <ul className='min-h-0 flex-1 overflow-y-auto' data-testid='wt-commit-changes-list'>
                {changesState.value.entries.map(unit => (
                  <li key={changeUnitKey(unit)}>
                    <div
                      className={`gd-row${selectedUnit === unit ? 'gd-row-selected' : ''}`}
                      data-unit-key={changeUnitKey(unit)}
                      onClick={() => setSelectedUnitKey(changeUnitKey(unit))}
                      onKeyDown={event => {
                        if (event.key === 'Enter') setSelectedUnitKey(changeUnitKey(unit));
                      }}
                      data-testid='wt-commit-change-item'
                      role='button'
                      tabIndex={0}
                    >
                      <div className='flex min-w-0 items-center gap-2' title={gdEntryPath(unit)}>
                        {/* 路径中间省略（与更改列表同一形态） */}
                        <span
                          className='flex min-w-0 flex-1 items-center text-[13px]'
                          style={{ color: gdPathColor(unit.operation) }}
                        >
                          <span className='shrink-0'>
                            {unit.namespace}/{gdTableName(unit.entity)}/
                          </span>
                          <span className='gd-truncate-tail min-w-0'>
                            <span>{unit.entityId}</span>
                          </span>
                        </span>
                        {createElement(gdOpIcon(unit.operation), {
                          className: 'shrink-0',
                          size: 16,
                          style: { color: gdOpColor(unit.operation) }
                        })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {/* 文件列表右缘的分隔条：按住拖动调宽（GitHub Desktop 的同款可拖分隔）。 */}
            <div className='gd-resizer' onPointerDown={startFilesResize} aria-hidden={true}></div>
            <div className='gd-history-diff min-w-0 flex-1' data-testid='wt-history-diff'>
              <WorkingTreeDiffViewer entry={selectedUnit} />
            </div>
          </>
        : changesState.phase === 'loading' ?
          <p className='py-6 text-center text-xs' style={{ color: 'var(--gd-muted)' }}>
            Loading changes…
          </p>
        : changesState.phase === 'error' ?
          <p className='py-6 text-center text-xs' style={{ color: 'var(--gd-del-fg)' }}>
            {changesState.error.message}
          </p>
        : null}
      </div>
    </div>
  );
}
