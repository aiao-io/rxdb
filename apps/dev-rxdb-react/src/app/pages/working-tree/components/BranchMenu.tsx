import { RxDBBranch } from '@aiao/rxdb';
import clsx from 'clsx';
import { Check, ChevronDown, ChevronRight, GitBranch, GitMerge, MoreVertical, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gdRelativeTime } from '../utils/gd';
import { isImeComposing } from '../utils/ime';

interface WorkingTreeBranchMenuProps {
  readonly branches: readonly RxDBBranch[];
  readonly activeBranch: string;
  /** 下拉面板宽：与仓库 foldout 同宽（页面把工具栏分支段宽传进来）。 */
  readonly popupWidth: number;
  /** 下拉开合 */
  readonly menuOpen: boolean;
  readonly onMenuOpenChange: (open: boolean) => void;
  /** 行上右键；页面按条目拼菜单（复制分支名 / 删除）。 */
  readonly onMenuRequest: (request: { target: RxDBBranch; event: React.MouseEvent }) => void;
  /** 下拉底部「Choose a branch to merge into 当前分支」：页面打开合并对话框，在里面挑来源 */
  readonly onMergeRequest: () => void;
  /** 点行（非当前分支）立即切换。 */
  readonly onSwitchBranch: (branchId: string) => void;
  /** 「New branch」：页面打开「Create a branch」对话框 */
  readonly onCreateRequest: () => void;
}

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 下拉是**内联**渲染（absolute 定位在按钮下方）而不是 overlay：
 * overlay 会把节点追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户
 * 从触发按钮按 Tab 会直接跳进侧栏，永远走不进下拉。内联渲染让「按钮 → 筛选框 →
 * 新建 → 分支行 → ⋯」落在自然 DOM 顺序里，a11y 用例的纯 Tab 走查才走得通。
 *
 * 下拉顶部带筛选框（GitHub Desktop 的分支下拉同样可以打字筛）：按名字子串过滤，
 * 大小写不敏感。当前分支行右端画 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：工作树有未提交改动时，页面弹「Switch branch」对话框问改动怎么办。
 * 行上的右键（触屏是行尾 ⋯）只有复制分支名与删除，与 GitHub Desktop 的分支右键菜单一致；合并在下拉底部的
 * 「Choose a branch to merge into 当前分支」（GitHub Desktop `branches-container.tsx` 的 merge-button-row）。
 * 「New branch」收起下拉、交给页面打开「Create a branch」对话框（与 History 右键的从提交建分支共用）。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，
 * 滚动容器里的右对齐下拉会向左伸进侧栏区域被裁剪——裁掉的那块恰好是操作按钮的
 * 位置，点击会被 fixed 背板吃掉（Angular 端 2026-09-18 实测复现，见 e2e）。
 *
 * ARIA：列表弹层是非模态的 `role="dialog"`，行是 `<ul>/<li>` 里的普通 `<button>`——弹层里还有
 * 筛选框与新建按钮，`role="menu"` 只许装菜单项（axe `aria-required-children`）；当前分支的行按钮
 * 带 `aria-current="true"`。Escape 关闭在输入法组字期间让给输入法（见 `isImeComposing`）。
 */

/**
 * 触屏没有右键：行尾 ⋯ 按钮按自身位置合成一次 contextmenu 请求，
 * 打开与右键相同的菜单（桌面端按钮隐藏，仍走原生右键）。
 */
function touchMenuRequest<T>(event: React.MouseEvent, target: T): { target: T; event: React.MouseEvent } {
  event.stopPropagation();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return {
    target,
    event: new MouseEvent('contextmenu', {
      clientX: rect.left,
      clientY: rect.bottom,
      bubbles: true
    }) as unknown as React.MouseEvent
  };
}

export function WorkingTreeBranchMenu({
  activeBranch,
  branches,
  menuOpen,
  popupWidth,
  onCreateRequest,
  onMenuOpenChange,
  onMenuRequest,
  onMergeRequest,
  onSwitchBranch
}: WorkingTreeBranchMenuProps): React.JSX.Element {
  /** 分支名筛选（大小写不敏感的子串匹配）。 */
  const [filter, setFilter] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupLeft, setPopupLeft] = useState(0);

  // 窄屏夹回：面板右缘不超出视口（右缘留 8px），左缘最多贴到视口左 8px
  useEffect(() => {
    if (!menuOpen) return;
    const popup = popupRef.current;
    const section = popup?.offsetParent as HTMLElement | null;
    if (!popup || !section) return;
    const sectionLeft = section.getBoundingClientRect().left;
    setPopupLeft(Math.max(8 - sectionLeft, Math.min(0, window.innerWidth - sectionLeft - popupWidth - 8)));
  }, [menuOpen, popupWidth]);

  const closeAll = () => {
    onMenuOpenChange(false);
    setFilter('');
  };

  // Escape 走 document 级监听而不是挂在容器 div 上：焦点在菜单/弹层的任意子元素上时
  // 事件都能冒泡到 document，而容器 div 挂交互 handler 会撞 jsx-a11y 的
  // interactive-supports-focus（div 不可聚焦）。
  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isImeComposing(event)) closeAll();
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
      onMenuOpenChange(true);
    }
  };

  /** 「New branch」：先收起下拉，对话框由页面开 */
  const requestCreate = () => {
    closeAll();
    onCreateRequest();
  };

  /** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
  const branchTime = (branch: RxDBBranch): Date => branch.updatedAt ?? branch.createdAt ?? new Date(0);

  /** 点行：非当前分支立即切换（GitHub Desktop 同款），当前分支只收起菜单。 */
  const onRowClick = (branch: RxDBBranch) => {
    if (branch.id === activeBranch) {
      closeAll();
      return;
    }
    onSwitchBranch(branch.id);
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
          aria-controls='wt-branch-menu-popup'
          aria-expanded={menuOpen}
          aria-haspopup='dialog'
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

        {menuOpen ?
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

        {menuOpen ?
          <div
            ref={popupRef}
            className='gd-menu gd-menu-flush absolute top-full left-0 z-40 flex flex-col overflow-y-auto'
            style={{ height: 'calc(100vh - 50px)', width: popupWidth, left: popupLeft }}
            aria-label='Branch list'
            data-testid='wt-branch-menu-popup'
            id='wt-branch-menu-popup'
            role='dialog'
          >
            <div className='flex items-center justify-between px-3 pt-1 pb-1.5'>
              <span className='text-[11px] font-semibold uppercase' style={{ color: 'var(--gd-muted)' }}>
                Branches ({branches.length})
              </span>
              <button
                className='gd-btn-ghost shrink-0'
                onClick={requestCreate}
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
                      aria-current={branch.id === activeBranch || undefined}
                      data-branch-id={branch.id}
                      onClick={() => onRowClick(branch)}
                      onContextMenu={event => onMenuRequest({ target: branch, event })}
                      data-testid='wt-branch-item'
                      type='button'
                    >
                      {/* 当前分支：前导图标换成勾（GitHub Desktop 同款） */}
                      {branch.id === activeBranch ?
                        <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                      : <GitBranch className='shrink-0' size={12} />}
                      <span
                        className={clsx('min-w-0 flex-1 truncate text-sm font-medium', {
                          'text-green-700': branch.id === activeBranch
                        })}
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
                    {/* 触屏没有右键：行尾 ⋯ 打开同一菜单（桌面端隐藏） */}
                    <button
                      className='gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex'
                      onClick={event => onMenuRequest(touchMenuRequest(event, branch))}
                      aria-label='更多操作'
                      data-testid='wt-branch-more'
                      title='更多操作（触屏）'
                      type='button'
                    >
                      <MoreVertical size={14} />
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
            {/* GitHub Desktop 的分支下拉底部：选一条分支合并进当前分支 */}
            <div className='gd-menu-divider'></div>
            <button
              className='gd-menu-row w-full shrink-0'
              onClick={onMergeRequest}
              data-testid='wt-branch-merge-into'
              title={`Choose a branch to merge into ${activeBranch}`}
              type='button'
            >
              <GitMerge className='shrink-0' size={14} />
              <span className='min-w-0 flex-1 truncate text-left text-sm'>
                Choose a branch to merge into <strong>{activeBranch}</strong>
              </span>
            </button>
          </div>
        : null}
      </div>
    </div>
  );
}
