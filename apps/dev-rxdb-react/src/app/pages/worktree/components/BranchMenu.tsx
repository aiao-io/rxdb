import { RxDBBranch } from '@aiao/rxdb';
import { ChevronRight, GitBranch, MoreVertical } from 'lucide-react';
import { gdRelativeTime } from '../utils/gd';
import { WorktreeToolbarDropdown, type WorktreeToolbarDropdownCopy } from './ToolbarDropdown';

/** 分支下拉的界面文案（原文照搬改造前的模板；背板名 e2e 会点）。 */
const BRANCH_MENU_COPY: WorktreeToolbarDropdownCopy = {
  caption: 'Current Branch',
  heading: 'Branches',
  createButton: 'New branch',
  createTitle: 'Create a branch',
  filterLabel: 'Filter branches',
  filterPlaceholder: 'Filter',
  listLabel: 'Branch list',
  backdropLabel: 'Close branch menu',
  emptyText: 'No branches yet',
  noMatchText: 'No matching branches'
};

interface WorktreeBranchMenuProps {
  readonly branches: readonly RxDBBranch[];
  readonly activeBranch: string;
  /** 下拉面板宽：与仓库 foldout 同宽（页面把工具栏分支段宽传进来）。 */
  readonly popupWidth: number;
  /** 有分支命令在途（建 / 切 / 删）：新建、每一行与创建按钮都禁用。 */
  readonly busy: boolean;
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

/** 分支的展示时间：优先 updatedAt，没有就 createdAt。 */
const branchTime = (branch: RxDBBranch): Date => branch.updatedAt ?? branch.createdAt ?? new Date(0);

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

/**
 * 顶部分支栏里的分支选择器，模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 开合、背板、Escape、回车提交、焦点、筛选与 ARIA 都在共享的 {@link WorktreeToolbarDropdown} 里；
 * 这里只给文案、行附加信息（来源分支 + 相对时间）与创建表单。筛选按分支名子串过滤，大小写不敏感；
 * 当前分支行前导画 ✓（GitHub Desktop 的选中标记）。
 *
 * **点行立即切换**（GitHub Desktop 同款）：切走仍走 `requireClean` 的被拒路径——demo 要演的
 * 「脏工作树被拒」这一步，被拒的 toast 就是行点击的结果。切换 / 合并 / 删除收进行的右键菜单
 * （GitHub Desktop 的分支行操作同样藏在行菜单里）。
 */
export function WorktreeBranchMenu({
  activeBranch,
  branchError,
  branchName,
  branches,
  busy,
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
}: WorktreeBranchMenuProps): React.JSX.Element {
  /** 弹层打开前清掉上一次的名字与错误。 */
  const resetCreateForm = () => {
    onBranchNameChange('');
    onBranchErrorChange(null);
  };

  /** 空名不往页面交：那是一条必然被拒的往返，错误就地呈现。分支名两端的空白不算名字。 */
  const confirmCreate = () => {
    const name = branchName.trim();
    if (!name) {
      onBranchErrorChange('Branch name is required.');
      return;
    }
    onCreateBranch(name);
  };

  return (
    <WorktreeToolbarDropdown
      busy={busy}
      copy={BRANCH_MENU_COPY}
      createBody={
        <>
          <div className='text-xs font-medium'>
            Create a branch <span style={{ color: 'var(--gd-muted)' }}>from {activeBranch}</span>
          </div>
          <input
            className='gd-input'
            onChange={event => {
              onBranchNameChange(event.target.value);
              onBranchErrorChange(null);
            }}
            data-autofocus
            data-testid='wt-branch-name'
            placeholder='feature/my-feature'
            type='text'
            value={branchName}
          />
        </>
      }
      createError={branchError}
      createFocusKey=''
      createOpen={createOpen}
      icon={GitBranch}
      isActive={branch => branch.activated}
      itemBranchId={branch => branch.id}
      itemKey={branch => branch.id}
      itemLabel={branch => branch.id}
      items={branches}
      listError={null}
      matches={(branch, needle) => branch.id.toLowerCase().includes(needle)}
      menuOpen={menuOpen}
      popupWidth={popupWidth}
      testIdPrefix='wt-branch'
      value={activeBranch}
      onConfirm={confirmCreate}
      onCreateOpenChange={onCreateOpenChange}
      onCreateOpening={resetCreateForm}
      onMenuOpenChange={onMenuOpenChange}
      onRowContextMenu={(branch, event) => onMenuRequest({ target: branch, event })}
      onSelect={branch => onSwitchBranch(branch.id)}
      renderRowActions={(branch, { busy }) => (
        <button
          className='gd-icon-btn hidden max-md:inline-flex pointer-coarse:inline-flex'
          disabled={busy}
          onClick={event => onMenuRequest(touchMenuRequest(event, branch))}
          aria-label='更多操作'
          data-testid='wt-branch-more'
          title='更多操作（触屏）'
          type='button'
        >
          <MoreVertical size={14} />
        </button>
      )}
      renderRowMeta={branch => (
        <>
          {branch.parentId && (
            <span className='flex min-w-0 items-center gap-0.5 text-xs' style={{ color: 'var(--gd-muted)' }}>
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
        </>
      )}
    />
  );
}
