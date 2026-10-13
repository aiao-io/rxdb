import { RxDBBranch } from '@aiao/rxdb';
import type { WorktreeInfo } from '@aiao/rxdb-plugin-worktree';
import { Check, ChevronDown, FolderTree, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** 创建弹层交给页面的请求；校验与建库调用由页面做。 */
export interface WorktreeCreateRequest {
  /** `existing` 钉一条已有分支；`new` 先建分支再钉（`git worktree add -b` 同款） */
  readonly mode: 'existing' | 'new';
  /** 要钉的分支（`new` 时即新分支名） */
  readonly branchId: string;
  /** 显示名；空白即不起名 */
  readonly label: string | undefined;
}

interface WorktreeMenuProps {
  readonly worktrees: readonly WorktreeInfo[];
  readonly branches: readonly RxDBBranch[];
  /** 当前 checkout 的分支；它没钉成 worktree 时，触发按钮就显示分支名。 */
  readonly activeBranch: string;
  readonly popupWidth: number;
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
}

/**
 * 工具栏里的 worktree 选择器（US-310，git worktree 能力；Angular 参考实现的行为级移植）。
 *
 * @remarks
 * 形态照抄分支下拉（`BranchMenu.tsx`）：内联 absolute 下拉 + fixed 背板 + 筛选框 + 创建弹层，
 * `left-0` 对齐（理由同那边：右对齐会伸进应用侧栏被滚动容器裁掉）。
 *
 * **点行 = 切到那个 worktree，不带 `requireClean`**：worktree 的未提交改动按分支隔离保存，
 * 切走再切回原样还在——这正是 worktree 相对「切分支前先提交 / 丢弃」的价值。
 *
 * 每行右端的移除按钮与行按钮是**兄弟**而不是嵌套（`<button>` 里套 `<button>` 是非法 HTML，
 * 读屏与键盘都会走丢）。当前所在的 worktree 移除按钮禁用（git 同款：删不掉当前 checkout）。
 */
export function WorktreeMenu({
  activeBranch,
  branches,
  createError,
  createOpen,
  menuOpen,
  popupWidth,
  worktrees,
  onCreateErrorChange,
  onCreateOpenChange,
  onCreateWorktree,
  onMenuOpenChange,
  onRemoveWorktree,
  onSwitchWorktree
}: WorktreeMenuProps): React.JSX.Element {
  /** worktree 筛选（label 与分支名的大小写不敏感子串匹配）。 */
  const [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [label, setLabel] = useState('');
  const newBranchInputRef = useRef<HTMLInputElement>(null);
  const branchSelectRef = useRef<HTMLSelectElement>(null);

  const closeAll = () => {
    onMenuOpenChange(false);
    onCreateOpenChange(false);
    setFilter('');
  };

  // 弹层一出现就把焦点送进第一个输入控件：创建是两步操作，第二步不能靠用户自己再点一下。
  useEffect(() => {
    if (!createOpen) return undefined;
    const timer = setTimeout(() => (mode === 'new' ? newBranchInputRef : branchSelectRef).current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [createOpen, mode]);

  // Escape 走 document 级监听，理由同分支下拉：焦点在弹层任意子元素上都能冒泡到这里。
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
    // closeAll 只调稳定 setter 与 setFilter；本组件每次 render 重建它，效应只在挂载时挂一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 还没钉成 worktree 的分支：一条分支只能有一个 worktree（与 `listWorktrees()` 求差）。 */
  const pinned = new Set(worktrees.map(worktree => worktree.branchId));
  const candidates = branches.filter(branch => !pinned.has(branch.id));

  /** 触发按钮上的名字：当前 worktree 的 label → 它的分支名 → 当前分支名（没钉住时）。 */
  const current = worktrees.find(worktree => worktree.active);
  const currentLabel = current ? (current.label ?? current.branchId) : activeBranch;

  const toggleMenu = () => {
    if (menuOpen) {
      closeAll();
    } else {
      onCreateOpenChange(false);
      onMenuOpenChange(true);
    }
  };

  const openCreate = () => {
    onMenuOpenChange(false);
    // 没有可钉的已有分支时直接进「新建分支」：空下拉框是一条走不通的路。
    const first = candidates[0]?.id ?? '';
    setMode(first === '' ? 'new' : 'existing');
    setSelectedBranch(first);
    setNewBranch('');
    setLabel('');
    onCreateErrorChange(null);
    onCreateOpenChange(true);
  };

  const changeMode = (next: 'existing' | 'new') => {
    setMode(next);
    onCreateErrorChange(null);
  };

  /** 点行：别的 worktree 立即切过去；当前那个只收起菜单。 */
  const onRowClick = (worktree: WorktreeInfo) => {
    if (worktree.active) {
      closeAll();
      return;
    }
    onSwitchWorktree(worktree.id);
  };

  /** 空分支名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
  const confirmCreate = () => {
    const branchId = (mode === 'new' ? newBranch : selectedBranch).trim();
    if (!branchId) {
      onCreateErrorChange(mode === 'new' ? 'Branch name is required.' : 'Pick a branch.');
      return;
    }
    const trimmedLabel = label.trim();
    onCreateWorktree({ mode, branchId, label: trimmedLabel === '' ? undefined : trimmedLabel });
  };

  const needle = filter.trim().toLowerCase();
  const filteredWorktrees =
    needle === '' ? worktrees : (
      worktrees.filter(
        worktree =>
          worktree.branchId.toLowerCase().includes(needle) || (worktree.label ?? '').toLowerCase().includes(needle)
      )
    );

  return (
    <div className='flex h-full items-stretch'>
      <div className='relative flex-1'>
        <button
          className='gd-toolbar-select'
          aria-expanded={menuOpen}
          aria-haspopup={true}
          onClick={toggleMenu}
          data-testid='wt-worktree-menu'
          type='button'
        >
          <FolderTree size={18} />
          <span className='min-w-0 flex-1 text-left'>
            <small>Current Worktree</small>
            <strong className='truncate' data-testid='wt-worktree-current'>
              {currentLabel || '…'}
            </strong>
          </span>
          <ChevronDown
            className='transition-transform'
            size={14}
            style={{ transform: menuOpen ? 'rotate(180deg)' : undefined }}
          />
        </button>

        {menuOpen || createOpen ?
          <div
            className='fixed inset-0 z-30'
            style={{ background: 'rgba(0, 0, 0, 0.35)' }}
            onClick={closeAll}
            onKeyDown={event => {
              if (event.key === 'Escape') closeAll();
            }}
            aria-label='Close worktree menu'
            role='button'
            tabIndex={0}
          ></div>
        : null}

        {createOpen ?
          <div
            className='gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1'
            style={{ width: popupWidth }}
            aria-label='Create a worktree'
            data-testid='wt-worktree-create-popover'
            role='dialog'
          >
            <div className='flex flex-col gap-2'>
              <div className='text-xs font-medium'>Create a worktree</div>
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
                candidates.length > 0 ?
                  <select
                    className='gd-input'
                    ref={branchSelectRef}
                    aria-label='Branch'
                    onChange={event => {
                      setSelectedBranch(event.target.value);
                      onCreateErrorChange(null);
                    }}
                    data-testid='wt-worktree-branch'
                    value={selectedBranch}
                  >
                    {candidates.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.id}
                      </option>
                    ))}
                  </select>
                : <p className='text-xs' style={{ color: 'var(--gd-muted)' }} data-testid='wt-worktree-no-candidates'>
                    Every branch already has a worktree — create a new branch instead.
                  </p>

              : <input
                  className='gd-input'
                  ref={newBranchInputRef}
                  aria-label='New branch name'
                  onChange={event => {
                    setNewBranch(event.target.value);
                    onCreateErrorChange(null);
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') confirmCreate();
                  }}
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
                onKeyDown={event => {
                  if (event.key === 'Enter') confirmCreate();
                }}
                data-testid='wt-worktree-label'
                placeholder='Label (optional)'
                type='text'
                value={label}
              />
              {createError !== null && (
                <p className='text-xs text-red-600' role='alert'>
                  {createError}
                </p>
              )}
              <div className='flex justify-end gap-2'>
                <button
                  className='gd-btn-secondary'
                  onClick={closeAll}
                  data-testid='wt-worktree-create-cancel'
                  type='button'
                >
                  Cancel
                </button>
                <button
                  className='gd-btn-primary'
                  onClick={confirmCreate}
                  data-testid='wt-worktree-create-confirm'
                  type='button'
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        : menuOpen ?
          <div
            className='gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto'
            style={{ height: 'calc(100vh - 50px)', width: popupWidth }}
            aria-label='Worktree list'
            data-testid='wt-worktree-menu-popup'
            role='menu'
          >
            <div className='flex items-center justify-between px-3 pt-1 pb-1.5'>
              <span className='text-[11px] font-semibold uppercase' style={{ color: 'var(--gd-muted)' }}>
                Worktrees ({worktrees.length})
              </span>
              <button
                className='gd-btn-ghost shrink-0'
                onClick={openCreate}
                data-testid='wt-worktree-create'
                type='button'
              >
                <Plus size={12} />
                New worktree
              </button>
            </div>
            <div className='relative px-2 pb-1.5'>
              <Search
                className='pointer-events-none absolute top-1/2 left-4 -translate-y-1/2'
                size={12}
                style={{ color: 'var(--gd-muted)' }}
              />
              <input
                className='gd-input'
                style={{ paddingLeft: 26 }}
                aria-label='Filter worktrees'
                onChange={event => setFilter(event.target.value)}
                placeholder='Filter'
                type='text'
                value={filter}
              />
            </div>
            <ul className='min-h-0 flex-1 overflow-y-auto py-1'>
              {filteredWorktrees.map(worktree => {
                const name = worktree.label ?? worktree.branchId;
                return (
                  <li key={worktree.id}>
                    <div className='flex items-stretch'>
                      <button
                        className='gd-menu-row min-w-0 flex-1'
                        data-branch-id={worktree.branchId}
                        data-worktree-id={worktree.id}
                        onClick={() => onRowClick(worktree)}
                        data-testid='wt-worktree-item'
                        role='menuitem'
                        type='button'
                      >
                        {worktree.active ?
                          <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                        : <FolderTree className='shrink-0' size={12} />}
                        <span
                          className={`min-w-0 flex-1 truncate text-sm font-medium${worktree.active ? 'text-green-700' : ''}`}
                          data-testid='wt-worktree-label-text'
                        >
                          {name}
                        </span>
                        <span className='shrink-0 text-xs' style={{ color: 'var(--gd-muted)' }}>
                          {worktree.branchId}
                        </span>
                      </button>
                      <button
                        className='gd-btn-ghost shrink-0 px-2'
                        aria-disabled={worktree.active}
                        aria-label={`Remove worktree ${name}`}
                        data-branch-id={worktree.branchId}
                        disabled={worktree.active}
                        onClick={() => onRemoveWorktree(worktree.id)}
                        title={worktree.active ? 'The current worktree cannot be removed' : undefined}
                        data-testid='wt-worktree-remove'
                        type='button'
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
              {worktrees.length === 0 ?
                <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                  No worktrees yet
                </li>
              : filteredWorktrees.length === 0 ?
                <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                  No matching worktrees
                </li>
              : null}
            </ul>
          </div>
        : null}
      </div>
    </div>
  );
}
