import { MAIN_BRANCH_ID } from '@aiao/rxdb';
import type { WorkingTreeBranchFromCommitRejection } from '@aiao/rxdb-plugin-working-tree';
import { GitBranch } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isImeComposing } from '../utils/ime';
import { WorkingTreeDialogShell } from './DialogShell';

/** 「Create a branch」对话框的状态；页面持有，本组件只做展示与转发。 */
export interface CreateBranchDialogState {
  /** 新分支基于的提交：History 右键点的那一个，或分支下拉 New branch 时当前分支的 HEAD */
  readonly base: {
    readonly commitId: string;
    /** 提交消息的第一行 */
    readonly summary: string;
  };
  /** 从哪打开：`commit` 是 History 的右键，`branch` 是分支下拉的 New branch——两者的说明文字不同 */
  readonly from: 'commit' | 'branch';
  /** 预检：`checking` 还在问，`ok` 能建，否则是建不了的原因 */
  readonly availability: 'checking' | 'ok' | WorkingTreeBranchFromCommitRejection;
}

interface WorkingTreeCreateBranchDialogProps {
  readonly dialog: CreateBranchDialogState | null;
  /** 当前分支 */
  readonly activeBranch: string;
  /** 名字框；页面持有，关了再开从空起 */
  readonly name: string;
  /** 上一次建分支的报错（名字不可用、已存在）；没有时为 `null` */
  readonly error: string | null;
  /** 建分支进行中：Create 与 Cancel 置灰，对话框关不掉 */
  readonly creating: boolean;
  readonly onNameChange: (name: string) => void;
  /** 确认：交出去掉首尾空白的名字 */
  readonly onConfirmRequested: (name: string) => void;
  readonly onCloseRequested: () => void;
}

/** 建不了的三种原因，写给用户看。 */
const UNAVAILABLE_REASONS: Readonly<Record<WorkingTreeBranchFromCommitRejection, (activeBranch: string) => string>> = {
  unreachable_target: activeBranch => `This commit is no longer in the history of ${activeBranch}.`,
  fork_point_unknown: () =>
    "This commit was made before branch points were recorded, so a branch can't be based on it.",
  history_rewritten: () =>
    'Changes in this commit were undone or redone after it was made, so a branch based on it would not match it.'
};

/** 说明文字：基于哪个提交，或基于当前分支（在默认分支上补一句它是默认分支，同 GitHub Desktop） */
const baseTextOf = (dialog: CreateBranchDialogState, activeBranch: string): string => {
  if (dialog.from === 'commit') {
    return `Your new branch will be based on the commit '${dialog.base.summary}' (${dialog.base.commitId.slice(0, 7)}) from your repository.`;
  }
  const based = `Your new branch will be based on your currently checked out branch (${activeBranch}).`;
  return activeBranch === MAIN_BRANCH_ID ?
      `${based} ${activeBranch} is the default branch for your repository.`
    : based;
};

/**
 * 新建分支（GitHub Desktop 的「Create a branch」对话框，`create-branch/create-branch-dialog.tsx`）。
 *
 * @remarks
 * 两个入口共用：History 右键的「Create branch from commit」从那个提交建，分支下拉的「New branch」从当前分支 HEAD 建。
 * 新分支都是干净的，当前分支的未提交改动留在原地（GitHub Desktop 的「Leave my changes」）；建完页面接着切过去，
 * 有改动时弹「Switch branch」。GitHub Desktop 在非默认分支上还让人挑「基于默认分支 / 当前分支」，库里从提交建分支
 * 只认当前分支历史上的提交，这里只给后者。
 *
 * 打开时页面先问一句这个提交建不建得了分支（`checkBranchFromCommit`），建不了就写明原因、Create 置灰，
 * 不让人先填名字再碰壁。外壳见 {@link WorkingTreeDialogShell}。
 *
 * 建分支进行中关不掉：Cancel 置灰，Escape 与点背板都不理（见组件里的 `requestClose`）。
 */
export function WorkingTreeCreateBranchDialog({
  activeBranch,
  creating,
  dialog,
  error,
  name,
  onCloseRequested,
  onConfirmRequested,
  onNameChange
}: WorkingTreeCreateBranchDialogProps): React.JSX.Element | null {
  const nameInput = useRef<HTMLInputElement>(null);
  const open = dialog !== null;

  // 打开那一刻把焦点送进名字框（GitHub Desktop 的对话框自动聚焦第一个输入框）；依赖只有开合，
  // 预检回来不再抢焦点。下一拍再聚焦，与 Angular 参考实现同一个 effect 模式。
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => nameInput.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  if (dialog === null) return null;

  const unavailableReason =
    dialog.availability === 'checking' || dialog.availability === 'ok' ?
      null
    : UNAVAILABLE_REASONS[dialog.availability](activeBranch);
  const canCreate = dialog.availability === 'ok' && name.trim() !== '' && !creating;

  const submit = (): void => {
    if (canCreate) onConfirmRequested(name.trim());
  };

  /**
   * Cancel、Escape、点背板：建分支进行中不理。
   *
   * GitHub Desktop 进行中把控件全置灰，Escape 却仍能关，关了之后分支照样建好、检出，被拒则另弹错误框。
   * 这里干脆不让关：被拒与报错总是落回这一个对话框，用不着为「关掉之后才被拒」另找出口；进行中只有一个事务那么长。
   */
  const requestClose = (): void => {
    if (!creating) onCloseRequested();
  };

  return (
    <WorkingTreeDialogShell
      labelledBy='wt-create-branch-title'
      onCloseRequested={requestClose}
      testId='wt-create-branch-dialog'
    >
      <div className='mb-4 flex items-center gap-2'>
        <GitBranch className='text-[var(--gd-accent)]' aria-hidden='true' size={18} />
        <h2 className='text-[15px] font-semibold' id='wt-create-branch-title'>
          Create a branch
        </h2>
      </div>

      <label className='mb-1 block text-sm font-medium' htmlFor='wt-create-branch-name'>
        Name
      </label>
      <input
        className='gd-input mb-3 w-full'
        id='wt-create-branch-name'
        ref={nameInput}
        onChange={event => onNameChange(event.target.value)}
        onKeyDown={event => {
          // 名字框里的回车提交；组字中的回车是输入法在确认候选词，不提交
          if (event.key !== 'Enter' || isImeComposing(event.nativeEvent)) return;
          event.preventDefault();
          submit();
        }}
        autoComplete='off'
        data-testid='wt-create-branch-name'
        type='text'
        value={name}
      />

      <p className='mb-3 text-sm' data-testid='wt-create-branch-base'>
        {baseTextOf(dialog, activeBranch)}
      </p>

      <div aria-live='polite'>
        {dialog.availability === 'checking' && (
          <p className='mb-3 text-xs' style={{ color: 'var(--gd-muted)' }} data-testid='wt-create-branch-checking'>
            Checking this commit…
          </p>
        )}
      </div>
      {unavailableReason !== null && (
        <p
          className='mb-3 text-sm'
          style={{ color: 'var(--gd-del-fg)' }}
          data-testid='wt-create-branch-unavailable'
          role='alert'
        >
          {unavailableReason}
        </p>
      )}
      {error !== null && (
        <p
          className='mb-3 text-sm'
          style={{ color: 'var(--gd-del-fg)' }}
          data-testid='wt-create-branch-error'
          role='alert'
        >
          {error}
        </p>
      )}

      <div className='flex justify-end gap-2'>
        <button
          className='gd-btn-secondary'
          disabled={creating}
          onClick={requestClose}
          data-testid='wt-create-branch-cancel'
          type='button'
        >
          Cancel
        </button>
        <button
          className='gd-btn-primary'
          disabled={!canCreate}
          onClick={submit}
          data-testid='wt-create-branch-confirm'
          type='button'
        >
          {creating ? 'Creating…' : 'Create branch'}
        </button>
      </div>
    </WorkingTreeDialogShell>
  );
}
