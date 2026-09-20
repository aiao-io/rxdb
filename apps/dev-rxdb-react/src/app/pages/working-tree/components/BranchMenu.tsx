import { RxDBBranch } from '@aiao/rxdb';
import { Check, ChevronDown, ChevronRight, GitBranch, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gdRelativeTime } from '../utils/gd';

interface WorkingTreeBranchMenuProps {
  readonly branches: readonly RxDBBranch[];
  readonly activeBranch: string;
  /** 下拉面板宽：与仓库 foldout 同宽（页面把工具栏分支段宽传进来）。 */
  readonly popupWidth: number;
  /** 下拉开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着）。 */
  readonly menuOpen: boolean;
  readonly createOpen: boolean;
  readonly branchName: string;
  readonly branchError: string | null;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onCreateOpenChange: (open: boolean) => void;
  readonly onBranchNameChange: (name: string) => void;
  readonly onBranchErrorChange: (error: string | null) => void;
  /** 行上右键；页面按条目拼菜单（切换 / 合并 / 删除 / 复制分支名）。 */
  readonly onMenuRequest: (request: { target: RxDBBranch; event: React.MouseEvent }) => void;
  /** 点行（非当前分支）立即切换。 */
  readonly onSwitchBranch: (branchId: string) => void;
  /** 创建确认；分支名校验与建库调用由页面做，组件只负责把名字交出去。 */
  readonly onCreateBranch: (name: string) => void;
}

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 overlay：
 * overlay 会把节点追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户
 * 从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。内联渲染让「按钮 → 筛选框 →
 * 新建 → 分支行 → ⋯」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行右端画 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：切走仍走 `requireClean` 的被拒路径——
 * demo 要演的「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果。合并 / 删除
 * 收进行的右键菜单（GitHub Desktop 的分支行操作同样藏在行菜单里）。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，
 * 滚动容器里的右对齐下拉会向左伸进侧栏区域被裁剪——裁掉的那块恰好是操作按钮的
 * 位置，点击会被 fixed 背板吃掉（Angular 端 2026-09-18 实测复现，见 e2e）。
 */
export function WorkingTreeBranchMenu({
  activeBranch,
  branchError,
  branchName,
  branches,
  createOpen,
  menuOpen,
  popupWidth,
  onBranchErrorChange,
  onBranchNameChange,
  onCreateBranch,
  onCreateOpenChange,
  onMenuOpenChange,
  onMenuRequest,
  onSwitchBranch
}: WorkingTreeBranchMenuProps): React.JSX.Element {
  /** 分支名筛选（大小写不敏感的子串匹配）。 */
  const [filter, setFilter] = useState('');
  const createInputRef = useRef<HTMLInputElement>(null);

  const closeAll = () => {
    onMenuOpenChange(false);
    onCreateOpenChange(false);
    setFilter('');
  };

  // 弹层一出现就把焦点送进名字输入框：创建分支是两步操作，第二步不能靠用户自己
  // 再点一下输入框（与 Angular 参考实现同一个 effect 模式）。
  useEffect(() => {
    if (createOpen) {
      const timer = setTimeout(() => createInputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [createOpen]);

  // Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单/弹层的任意子元素上时
  // 事件都能冒泡到 document，而容器 div 挂交互 handler 会撞 jsx-a11y 的
  // interactive-supports-focus（div 不可聚焦）。
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeAll();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
    // closeAll 只调稳定 setter 与 setFilter；本组件每次 render 重建它，效应只在挂载时挂一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    onBranchNameChange('');
    onBranchErrorChange(null);
    onCreateOpenChange(true);
  };

  /** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
  const branchTime = (branch: RxDBBranch): Date => branch.updatedAt ?? branch.createdAt ?? new Date(0);

  /** 点行：非当前分支立即切换（GitHub Desktop 同款），当前分支只收起菜单。 */
  const onRowClick = (branch: RxDBBranch) => {
    if (branch.activated) {
      closeAll();
      return;
    }
    onSwitchBranch(branch.id);
  };

  /** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。 */
  const confirmCreate = () => {
    const name = branchName.trim();
    if (!name) {
      onBranchErrorChange('Branch name is required.');
      return;
    }
    onCreateBranch(name);
  };

  // 筛出来的分支；空筛选 = 全量。
  const needle = filter.trim().toLowerCase();
  const filteredBranches =
    needle === '' ? branches : branches.filter(branch => branch.id.toLowerCase().includes(needle));

  return (
    <div className='flex h-full items-stretch'>
      <div className='relative flex-1'>
        <button
          className='gd-toolbar-select'
          aria-expanded={menuOpen}
          aria-haspopup={true}
          onClick={toggleMenu}
          data-testid='wt-branch-menu'
          type='button'
        >
          <GitBranch size={18} />
          <span className='min-w-0 flex-1 text-left'>
            <small>Current Branch</small>
            <strong className='truncate'>{activeBranch || '…'}</strong>
          </span>
          {/* 注意：动态 class 会被 lucide 指令的 className 覆写，旋转改用 style 绑定 */}
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
            aria-label='Close branch menu'
            role='button'
            tabIndex={0}
          ></div>
        : null}

        {createOpen ?
          <div
            className='gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1'
            style={{ width: popupWidth }}
            aria-label='Create a branch'
            data-testid='wt-branch-create-popover'
            role='dialog'
          >
            <div className='flex flex-col gap-2'>
              <div className='text-xs font-medium'>
                Create a branch <span style={{ color: 'var(--gd-muted)' }}>from {activeBranch}</span>
              </div>
              <input
                className='gd-input'
                ref={createInputRef}
                onChange={event => {
                  onBranchNameChange(event.target.value);
                  onBranchErrorChange(null);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') confirmCreate();
                }}
                data-testid='wt-branch-name'
                placeholder='feature/my-feature'
                type='text'
                value={branchName}
              />
              {branchError !== null && (
                <p className='text-xs text-red-600' role='alert'>
                  {branchError}
                </p>
              )}
              <div className='flex justify-end gap-2'>
                <button
                  className='gd-btn-secondary'
                  onClick={closeAll}
                  data-testid='wt-branch-create-cancel'
                  type='button'
                >
                  Cancel
                </button>
                <button
                  className='gd-btn-primary'
                  onClick={confirmCreate}
                  data-testid='wt-branch-create-confirm'
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
            aria-label='Branch list'
            data-testid='wt-branch-menu-popup'
            role='menu'
          >
            <div className='flex items-center justify-between px-3 pt-1 pb-1.5'>
              <span className='text-[11px] font-semibold uppercase' style={{ color: 'var(--gd-muted)' }}>
                Branches ({branches.length})
              </span>
              <button
                className='gd-btn-ghost shrink-0'
                onClick={openCreate}
                data-testid='wt-branch-create'
                type='button'
              >
                <Plus size={12} />
                New branch
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
                aria-label='Filter branches'
                onChange={event => setFilter(event.target.value)}
                placeholder='Filter'
                type='text'
                value={filter}
              />
            </div>
            <ul className='min-h-0 flex-1 overflow-y-auto py-1'>
              {filteredBranches.map(branch => (
                <li key={branch.id}>
                  <div className='flex items-stretch'>
                    <button
                      className='gd-menu-row min-w-0 flex-1'
                      data-branch-id={branch.id}
                      onClick={() => onRowClick(branch)}
                      onContextMenu={event => onMenuRequest({ target: branch, event })}
                      data-testid='wt-branch-item'
                      role='menuitem'
                      type='button'
                    >
                      {/* 当前分支：前导图标换成勾（GitHub Desktop 同款） */}
                      {branch.activated ?
                        <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                      : <GitBranch className='shrink-0' size={12} />}
                      <span
                        className={`min-w-0 flex-1 truncate text-sm font-medium${branch.activated ? 'text-green-700' : ''}`}
                      >
                        {branch.id}
                      </span>
                      {branch.parentId && (
                        <span
                          className='flex min-w-0 items-center gap-0.5 text-xs'
                          style={{ color: 'var(--gd-muted)' }}
                        >
                          <ChevronRight size={10} />
                          {branch.parentId}
                        </span>
                      )}
                      {/* GitHub Desktop 的分支行右端是上次提交的相对时间；悬停给完整时间戳 */}
                      <span
                        className='shrink-0 text-xs'
                        style={{ color: 'var(--gd-muted)' }}
                        title={branchTime(branch).toLocaleString()}
                      >
                        {gdRelativeTime(branchTime(branch))}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
              {branches.length === 0 ?
                <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                  No branches yet
                </li>
              : filteredBranches.length === 0 ?
                <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                  No matching branches
                </li>
              : null}
            </ul>
          </div>
        : null}
      </div>
    </div>
  );
}
