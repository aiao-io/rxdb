import type { CommitResult, WorkingTreeCommandState } from '@aiao/rxdb-plugin-working-tree';
import { RefreshCw } from 'lucide-react';
import { gdAvatarColor, gdAvatarInitial } from '../utils/gd';

interface WorkingTreeCommitBoxProps {
  /** 提交摘要（message 的第一行）。 */
  readonly summary: string;
  /** 可选描述（并入 message 第二段）。 */
  readonly description: string;
  /** 目标分支名：按钮文案「提交到 <branch>」。 */
  readonly activeBranch: string;
  /** 头像圆的作者名；demo 的写者固定是 `demo-author`。 */
  readonly authorId?: string;
  readonly notice: string | null;
  readonly commitState: WorkingTreeCommandState<CommitResult>;
  readonly onSummaryChange: (summary: string) => void;
  readonly onDescriptionChange: (description: string) => void;
  readonly onCommit: () => void;
}

/**
 * 侧栏底部的提交框，模仿 GitHub Desktop 的 Summary / Description /「Commit to <branch>」。
 *
 * @remarks
 * 布局与交互逐条对照过 desktop/desktop 的 `commit-message.tsx`：
 * - 第一行头像 + 单行摘要（GitHub Desktop 的 Summary 是 `AutocompletingInput`，不是会
 *   自增高的 textarea）；描述整宽压下来，**左缘与头像左缘对齐**（description 容器
 *   是 summary 行的兄弟而不是嵌套，GitHub Desktop 同款）；描述 `min-height: 100px`、
 *   禁拖拽（`.description-focus-container`）。
 * - 提交按钮**通栏**（`.commit-button` 继承 GitHub Desktop 按钮的 100% 宽），**没有图标**：
 *   只有「提交到 <branch>」文字，提交中才亮 spinner（GitHub Desktop 的 `<Loading />`），
 *   摘要为空时**禁用**（`isSummaryBlank`，tooltip 原文 "A commit summary is required to
 *   commit"），两个输入框提交中只读。
 * - 没有可见的「Committed / idle」状态行：GitHub Desktop 的成功反馈是 **sr-only** 的
 *   `aria-live` 播报（"Committed Just now - …"），本组件同样只留一条读屏播报；
 *   失败由页面层弹 toast（GitHub Desktop 的提交失败是对话框，demo 的对应物是 toast）。
 * 后端只收一个 `message`（见 `CommitOptions` 的 TSDoc），摘要与描述在这里合成
 * `summary + '\n\n' + description`——合成发生在页面提交时而不是本组件里，组件只负责
 * 两个草稿框。
 */
export function WorkingTreeCommitBox({
  activeBranch,
  authorId = 'demo-author',
  commitState,
  description,
  notice,
  onCommit,
  onDescriptionChange,
  onSummaryChange,
  summary
}: WorkingTreeCommitBoxProps): React.JSX.Element {
  const isCommitting = commitState.phase === 'loading';
  const summaryBlank = summary.trim() === '';

  return (
    <div
      className='shrink-0 space-y-2 border-t p-3'
      style={{ background: 'var(--gd-bg)', borderColor: 'var(--gd-border)' }}
      data-testid='wt-commit-box'
    >
      {notice !== null && (
        <div className='gd-warn-strip rounded' data-testid='wt-notice' role='alert'>
          <span>{notice}</span>
        </div>
      )}
      {/* 第一行：头像 + 单行摘要；描述整宽压下来，左缘与头像左缘对齐（GitHub Desktop 同款）。 */}
      <div className='flex gap-2'>
        <span
          className='gd-avatar text-[11px]'
          style={{ background: gdAvatarColor(authorId), height: 25, width: 25 }}
          title={authorId}
        >
          {gdAvatarInitial(authorId)}
        </span>
        <input
          className='gd-input min-w-0 flex-1'
          aria-label='Commit summary (required)'
          data-testid='wt-commit-message'
          onChange={event => onSummaryChange(event.target.value)}
          placeholder='Summary (required)'
          readOnly={isCommitting}
          type='text'
          value={summary}
        />
      </div>
      <textarea
        className='gd-input min-h-[100px]'
        aria-label='Commit description (optional)'
        data-testid='wt-commit-description'
        onChange={event => onDescriptionChange(event.target.value)}
        placeholder='Description'
        readOnly={isCommitting}
        value={description}
      ></textarea>
      <button
        className='gd-btn-primary w-full'
        disabled={summaryBlank || isCommitting}
        title={
          isCommitting ? 'Committing…'
          : summaryBlank ?
            'A commit summary is required to commit'
          : 'No staging area: commits all uncommitted changes, like git commit -am'
        }
        onClick={onCommit}
        data-testid='wt-commit'
        type='button'
      >
        {/* GitHub Desktop 的提交按钮没有图标：只有文字，提交中才亮 spinner（<Loading />）。 */}
        {isCommitting && <RefreshCw className='animate-spin' size={13} />}
        Commit to {activeBranch || '…'}
      </button>
      {/* GitHub Desktop 的提交成功对眼睛不可见：同款 sr-only 播报，读屏专用。 */}
      <span className='sr-only' aria-atomic='true' aria-live='polite' data-testid='wt-commit-live' role='status'>
        {commitState.phase === 'success' && commitState.value.ok ? 'Committed' : ''}
      </span>
    </div>
  );
}
