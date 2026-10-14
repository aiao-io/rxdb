import { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { FolderTree, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { WorktreeToolbarDropdown, type WorktreeToolbarDropdownCopy } from './ToolbarDropdown';

/** worktree 下拉的界面文案（原文照搬改造前的模板；背板名 e2e 会点）。 */
const WORKTREE_MENU_COPY: WorktreeToolbarDropdownCopy = {
  caption: 'Current Worktree',
  heading: 'Worktrees',
  createButton: 'New worktree',
  createTitle: 'Create a worktree',
  filterLabel: 'Filter worktrees',
  filterPlaceholder: 'Filter',
  listLabel: 'Worktree list',
  backdropLabel: 'Close worktree menu',
  emptyText: 'No worktrees yet',
  noMatchText: 'No matching worktrees'
};

/** 创建弹层交给页面的请求；建分支与钉住的调用由页面做。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先 `createBranch`（FR-017：会复制当前未提交改动），再钉住 */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名，已去掉两端空白） */
  readonly branchId: string;
  /** 显示名，原样交出（不 trim）；空串即不起名，全是空白由核心以 `WorktreeLabelError` 拒绝 */
  readonly label: string | undefined;
}

interface WorktreeMenuProps {
  readonly worktrees: readonly WorktreeInfo[];
  readonly branches: readonly RxDBBranch[];
  /** 当前 checkout 的分支；它没钉成 worktree 时，触发按钮就显示分支名。 */
  readonly activeBranch: string;
  readonly popupWidth: number;
  /** 有 worktree 命令在途：新建、每一行、移除与创建按钮都禁用。 */
  readonly busy: boolean;
  /** 列表读失败的文案；非 null 时列表换成错误块 + Retry，不提供新建。 */
  readonly listError: string | null;
  /** 当前工作树的未提交改动数；`new` 模式据此提示新分支会带上这些改动。 */
  readonly uncommittedCount: number | null;
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen: boolean;
  readonly createOpen: boolean;
  readonly createError: string | null;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onCreateOpenChange: (open: boolean) => void;
  readonly onCreateErrorChange: (error: string | null) => void;
  readonly onSwitchWorktree: (id: string) => void;
  readonly onRemoveWorktree: (id: string) => void;
  readonly onCreateWorktree: (request: WorktreeCreateRequest) => void;
  /** 列表读失败后的 Retry。 */
  readonly onRetryList: () => void;
}

/** 一个 worktree 在界面上的名字：label，没有就是分支名。 */
const worktreeName = (worktree: WorktreeInfo): string => worktree.label ?? worktree.branchId;

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力；Angular 参考实现的行为级移植）。
 *
 * @remarks
 * 形态与分支下拉共用 {@link WorktreeToolbarDropdown}（内联 absolute 下拉 + fixed 背板 + 筛选框 +
 * 创建弹层）；这里只给文案、行附加信息（所钉分支）、行右端的移除按钮与创建表单。
 *
 * **点行 = 切到那个 worktree，不带 `requireClean`**：worktree 的未提交改动按分支隔离保存，
 * 切走再切回原样还在——这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。
 *
 * 当前所在的 worktree 移除按钮禁用（git 同款：删不掉当前 checkout），有命令在途时所有移除按钮都禁用。
 *
 * 创建表单的分支下拉第一项是禁用的「Pick a branch…」占位：受控 `<select>` 的值对不上任何选项时，
 * 浏览器会把第一个可选项画成选中，界面显示的分支与将要提交的值就分了家。值绑在派生的选中项上
 * （选过的分支还在候选里才算数，否则落回占位），列表在弹层开着时变了也不会悄悄换成别的分支。
 */
export function WorktreeWorktreeMenu({
  activeBranch,
  branches,
  busy,
  createError,
  createOpen,
  listError,
  menuOpen,
  popupWidth,
  uncommittedCount,
  worktrees,
  onCreateErrorChange,
  onCreateOpenChange,
  onCreateWorktree,
  onMenuOpenChange,
  onRemoveWorktree,
  onRetryList,
  onSwitchWorktree
}: WorktreeMenuProps): React.JSX.Element {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [label, setLabel] = useState('');

  // 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。
  // 列表读失败时不知道谁已被钉住，一条都不提供。
  const pinned = new Set(worktrees.map(worktree => worktree.branchId));
  const candidates = listError === null ? branches.filter(branch => !pinned.has(branch.id)) : [];
  /** 下拉实际绑定的值：选过的分支还在候选里才算数，否则落回占位。 */
  const selection = candidates.some(branch => branch.id === selectedBranch) ? selectedBranch : '';

  // 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。
  const current = worktrees.find(worktree => worktree.active);
  const currentLabel = current ? worktreeName(current) : activeBranch;

  /** 弹层打开前重置表单；没有可钉的已有分支时直接进「新建分支」——空下拉框是一条走不通的路。 */
  const resetCreateForm = () => {
    const first = candidates[0]?.id ?? '';
    setMode(first === '' ? 'new' : 'existing');
    setSelectedBranch(first);
    setNewBranch('');
    setLabel('');
    onCreateErrorChange(null);
  };

  const changeMode = (next: 'existing' | 'new') => {
    setMode(next);
    onCreateErrorChange(null);
  };

  /** 空分支名不往页面交：那是一条必然被拒的往返，错误就地呈现。label 原样交出，不 trim。 */
  const confirmCreate = () => {
    const branchId = mode === 'new' ? newBranch.trim() : selection;
    if (!branchId) {
      onCreateErrorChange(mode === 'new' ? 'Branch name is required.' : 'Pick a branch.');
      return;
    }
    onCreateWorktree({ mode, branchId, label: label === '' ? undefined : label });
  };

  const copyNote =
    mode === 'new' && uncommittedCount !== null && uncommittedCount > 0 ?
      `The new branch starts with a copy of your ${uncommittedCount} uncommitted ${uncommittedCount === 1 ? 'change' : 'changes'}.`
    : null;

  const existingBranchField =
    candidates.length > 0 ?
      <select
        className='gd-input'
        aria-label='Branch'
        onChange={event => {
          setSelectedBranch(event.target.value);
          onCreateErrorChange(null);
        }}
        data-autofocus
        data-testid='wt-worktree-branch'
        value={selection}
      >
        <option disabled value=''>
          Pick a branch…
        </option>
        {candidates.map(branch => (
          <option key={branch.id} value={branch.id}>
            {branch.id}
          </option>
        ))}
      </select>
    : <p className='text-xs' style={{ color: 'var(--gd-muted)' }} data-testid='wt-worktree-no-candidates'>
        Every branch already has a worktree — create a new branch instead.
      </p>;

  return (
    <WorktreeToolbarDropdown
      busy={busy}
      copy={WORKTREE_MENU_COPY}
      createBody={
        <>
          <div className='text-xs font-medium'>{WORKTREE_MENU_COPY.createTitle}</div>
          <fieldset className='flex gap-3 text-xs'>
            <legend className='sr-only'>Branch for the new worktree</legend>
            <label className='flex items-center gap-1'>
              <input
                checked={mode === 'existing'}
                onChange={() => changeMode('existing')}
                data-testid='wt-worktree-mode-existing'
                name='wt-worktree-mode'
                type='radio'
              />
              Existing branch
            </label>
            <label className='flex items-center gap-1'>
              <input
                checked={mode === 'new'}
                onChange={() => changeMode('new')}
                data-testid='wt-worktree-mode-new'
                name='wt-worktree-mode'
                type='radio'
              />
              New branch
            </label>
          </fieldset>
          {mode === 'existing' ?
            existingBranchField
          : <input
              className='gd-input'
              aria-label='New branch name'
              onChange={event => {
                setNewBranch(event.target.value);
                onCreateErrorChange(null);
              }}
              data-autofocus
              data-testid='wt-worktree-new-branch'
              placeholder='feature/my-feature'
              type='text'
              value={newBranch}
            />
          }
          <input
            className='gd-input'
            aria-label='Label (optional)'
            onChange={event => setLabel(event.target.value)}
            data-testid='wt-worktree-label'
            placeholder='Label (optional)'
            type='text'
            value={label}
          />
          {copyNote !== null && (
            <p className='text-xs' style={{ color: 'var(--gd-muted)' }} data-testid='wt-worktree-copy-note'>
              {copyNote}
            </p>
          )}
        </>
      }
      createError={createError}
      createFocusKey={mode}
      createOpen={createOpen}
      icon={FolderTree}
      isActive={worktree => worktree.active}
      itemBranchId={worktree => worktree.branchId}
      itemKey={worktree => worktree.id}
      itemLabel={worktreeName}
      items={worktrees}
      listError={listError}
      matches={(worktree, needle) =>
        worktree.branchId.toLowerCase().includes(needle) || (worktree.label ?? '').toLowerCase().includes(needle)
      }
      menuOpen={menuOpen}
      popupWidth={popupWidth}
      testIdPrefix='wt-worktree'
      value={currentLabel}
      onConfirm={confirmCreate}
      onCreateOpenChange={onCreateOpenChange}
      onCreateOpening={resetCreateForm}
      onMenuOpenChange={onMenuOpenChange}
      onRetry={onRetryList}
      onSelect={worktree => onSwitchWorktree(worktree.id)}
      renderRowActions={(worktree, { busy: rowBusy }) => (
        <button
          className='gd-btn-ghost shrink-0 px-2'
          aria-label={`Remove worktree ${worktreeName(worktree)}`}
          data-branch-id={worktree.branchId}
          disabled={worktree.active || rowBusy}
          onClick={() => onRemoveWorktree(worktree.id)}
          title={worktree.active ? 'The current worktree cannot be removed' : undefined}
          data-testid='wt-worktree-remove'
          type='button'
        >
          <Trash2 size={12} />
        </button>
      )}
      renderRowMeta={worktree => (
        <span className='shrink-0 text-xs' style={{ color: 'var(--gd-muted)' }}>
          {worktree.branchId}
        </span>
      )}
    />
  );
}
