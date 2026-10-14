import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FolderTree } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorktreeToolbarDropdown,
  type WorktreeToolbarDropdownCopy,
  type WorktreeToolbarDropdownRowContext
} from './ToolbarDropdown';

/**
 * @fileoverview 共享工具栏下拉的组件测试。
 *
 * @remarks
 * 列表读失败与在途禁用在 e2e 里没法稳定造出来（读失败要坏掉的库，在途只有几毫秒），所以错误块 + Retry、
 * 在途禁用、ARIA 结构与 IME 守卫锁在这里；真实菜单上的行为由 worktree.spec / worktree.a11y.spec 锁定。
 * 开合状态由一个小外壳持有（与页面一样走受控 + 回写），回调另外记一份供断言。
 */

afterEach(cleanup);

interface Item {
  readonly id: string;
  readonly active: boolean;
}

const COPY: WorktreeToolbarDropdownCopy = {
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

const ITEMS: readonly Item[] = [
  { id: 'main', active: true },
  { id: 'feature/x', active: false }
];

interface HarnessProps {
  readonly items?: readonly Item[];
  readonly busy?: boolean;
  readonly listError?: string | null;
  readonly createFocusKey?: string;
  readonly createBody?: ReactNode;
  readonly initialMenuOpen?: boolean;
  readonly initialCreateOpen?: boolean;
  readonly calls?: string[];
  readonly onSelect?: (item: Item) => void;
  readonly onConfirm?: () => void;
  readonly onRetry?: () => void;
  readonly onMenuOpenChange?: (open: boolean) => void;
  readonly onCreateOpenChange?: (open: boolean) => void;
  readonly matches?: (item: Item, needle: string) => boolean;
  readonly renderRowActions?: (item: Item, context: WorktreeToolbarDropdownRowContext) => ReactNode;
}

const DEFAULT_BODY = (
  <>
    <input data-autofocus data-testid='body-text' type='text' />
    <input data-testid='body-radio' name='body-mode' type='radio' />
  </>
);

/** 受控外壳：开合状态在这里，回调同时记进 `calls`（断言调用顺序）。 */
function Harness({
  busy = false,
  calls = [],
  createBody = DEFAULT_BODY,
  createFocusKey = '',
  initialCreateOpen = false,
  initialMenuOpen = false,
  items = ITEMS,
  listError = null,
  matches = (item, needle) => item.id.includes(needle),
  onConfirm,
  onCreateOpenChange,
  onMenuOpenChange,
  onRetry,
  onSelect,
  renderRowActions
}: HarnessProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const [createOpen, setCreateOpen] = useState(initialCreateOpen);
  return (
    <WorktreeToolbarDropdown
      busy={busy}
      copy={COPY}
      createBody={createBody}
      createError={null}
      createFocusKey={createFocusKey}
      createOpen={createOpen}
      icon={FolderTree}
      isActive={item => item.active}
      itemBranchId={item => item.id}
      itemKey={item => item.id}
      itemLabel={item => item.id}
      items={items}
      listError={listError}
      matches={matches}
      menuOpen={menuOpen}
      popupWidth={320}
      testIdPrefix='wt-worktree'
      value='main'
      onConfirm={() => {
        calls.push('confirm');
        onConfirm?.();
      }}
      onCreateOpenChange={open => {
        calls.push(`createOpen:${open}`);
        onCreateOpenChange?.(open);
        setCreateOpen(open);
      }}
      onCreateOpening={() => calls.push('createOpening')}
      onMenuOpenChange={open => {
        calls.push(`menuOpen:${open}`);
        onMenuOpenChange?.(open);
        setMenuOpen(open);
      }}
      onRetry={onRetry}
      onSelect={item => onSelect?.(item)}
      renderRowActions={renderRowActions}
      renderRowMeta={item => <span data-testid='row-meta'>{item.id}</span>}
    />
  );
}

const rows = (): HTMLElement[] => screen.getAllByTestId('wt-worktree-item');

describe('WorktreeToolbarDropdown', () => {
  it('ARIA：触发按钮 haspopup=dialog + aria-controls，列表弹层是带名字的非模态 dialog，当前行 aria-current', () => {
    render(<Harness />);
    const trigger = screen.getByTestId('wt-worktree-menu');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-controls')).toBe('wt-worktree-menu-popup');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('wt-worktree-current').textContent).toBe('main');

    fireEvent.click(trigger);

    const popup = screen.getByTestId('wt-worktree-menu-popup');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.id).toBe('wt-worktree-menu-popup');
    expect(popup.getAttribute('aria-label')).toBe('Worktree list');
    expect(popup.hasAttribute('aria-modal')).toBe(false);
    // 行是 <ul>/<li> 里的普通按钮：没有 role，当前项 aria-current="true"，其余不带这个属性
    const [current, other] = rows();
    expect(current.closest('ul > li')).not.toBeNull();
    expect(current.hasAttribute('role')).toBe(false);
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(current.getAttribute('data-branch-id')).toBe('main');
    expect(other.hasAttribute('aria-current')).toBe(false);
    expect(screen.getAllByTestId('wt-worktree-label-text').map(label => label.textContent)).toEqual([
      'main',
      'feature/x'
    ]);
  });

  it('列表读失败：错误块（role=alert）替换整个列表，Retry 发 retry，新建禁用', () => {
    const onRetry = vi.fn();
    render(<Harness initialMenuOpen listError="Couldn't load worktrees. boom" onRetry={onRetry} />);

    const block = screen.getByTestId('wt-worktree-list-error');
    expect(block.getAttribute('role')).toBe('alert');
    expect(block.textContent).toContain("Couldn't load worktrees. boom");
    expect(screen.getByTestId('wt-worktree-menu-popup').querySelector('ul')).toBeNull();
    expect(screen.queryAllByTestId('wt-worktree-item')).toHaveLength(0);
    expect((screen.getByTestId('wt-worktree-create') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('wt-worktree-list-retry'));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('在途：新建、每一行与创建按钮都禁用，行操作拿到 busy，回车不确认', () => {
    const renderRowActions = vi.fn((item: Item, context: WorktreeToolbarDropdownRowContext) => (
      <button disabled={context.busy} data-testid='row-action' type='button'>
        {item.id}
      </button>
    ));
    const { unmount } = render(<Harness busy initialMenuOpen renderRowActions={renderRowActions} />);

    expect((screen.getByTestId('wt-worktree-create') as HTMLButtonElement).disabled).toBe(true);
    expect(rows().every(row => (row as HTMLButtonElement).disabled)).toBe(true);
    expect(renderRowActions).toHaveBeenCalledWith(ITEMS[1], { busy: true });
    unmount();

    const calls: string[] = [];
    render(<Harness busy calls={calls} initialCreateOpen />);
    expect((screen.getByTestId('wt-worktree-create-confirm') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByTestId('body-text'), { key: 'Enter' });
    expect(calls).not.toContain('confirm');
  });

  it('回车只在文本框里确认：组字中（isComposing / keyCode 229）、按钮与单选框上的回车都不确认', () => {
    const onConfirm = vi.fn();
    render(<Harness initialCreateOpen onConfirm={onConfirm} />);
    const text = screen.getByTestId('body-text');

    fireEvent.keyDown(text, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(text, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(screen.getByTestId('body-radio'), { key: 'Enter' });
    // 按钮上的回车靠原生 click 确认；容器再确认一次就是双提交
    fireEvent.keyDown(screen.getByTestId('wt-worktree-create-confirm'), { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(text, { key: 'Enter', keyCode: 13 });
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Escape：组字中不收；普通 Escape 收起所有层；都没开时什么都不做', () => {
    const onMenuOpenChange = vi.fn();
    const onCreateOpenChange = vi.fn();
    const { unmount } = render(
      <Harness initialMenuOpen onCreateOpenChange={onCreateOpenChange} onMenuOpenChange={onMenuOpenChange} />
    );
    const filter = screen.getByLabelText('Filter worktrees');

    fireEvent.keyDown(filter, { key: 'Escape', isComposing: true });
    expect(screen.queryByTestId('wt-worktree-menu-popup')).not.toBeNull();
    expect(onMenuOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(filter, { key: 'Escape' });
    expect(screen.queryByTestId('wt-worktree-menu-popup')).toBeNull();
    expect(onMenuOpenChange).toHaveBeenCalledWith(false);
    expect(onCreateOpenChange).toHaveBeenCalledWith(false);
    unmount();

    onMenuOpenChange.mockClear();
    onCreateOpenChange.mockClear();
    render(<Harness onCreateOpenChange={onCreateOpenChange} onMenuOpenChange={onMenuOpenChange} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onMenuOpenChange).not.toHaveBeenCalled();
    expect(onCreateOpenChange).not.toHaveBeenCalled();
  });

  it('点行：非当前项发 select；当前项只收起菜单', () => {
    const onSelect = vi.fn();
    render(<Harness initialMenuOpen onSelect={onSelect} />);

    fireEvent.click(rows()[1]);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);

    fireEvent.click(rows()[0]);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('wt-worktree-menu-popup')).toBeNull();
  });

  it('新建：先收列表、发 createOpening，再开创建弹层，焦点落进 [data-autofocus]', () => {
    const calls: string[] = [];
    render(<Harness calls={calls} initialMenuOpen />);

    fireEvent.click(screen.getByTestId('wt-worktree-create'));

    expect(calls).toEqual(['menuOpen:false', 'createOpening', 'createOpen:true']);
    const popover = screen.getByTestId('wt-worktree-create-popover');
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.getAttribute('aria-label')).toBe('Create a worktree');
    expect(popover.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(screen.getByTestId('body-text'));
  });

  it('createFocusKey 一变，焦点跟着换到新的 [data-autofocus]', () => {
    const first = <input data-autofocus data-testid='first' type='text' />;
    const second = <input data-autofocus data-testid='second' type='text' />;
    const { rerender } = render(<Harness createBody={first} createFocusKey='existing' initialCreateOpen />);
    expect(document.activeElement).toBe(screen.getByTestId('first'));

    rerender(<Harness createBody={second} createFocusKey='new' initialCreateOpen />);

    expect(document.activeElement).toBe(screen.getByTestId('second'));
  });

  it('筛选：trim + 小写后交给 matches；筛空与一条都没有各有文案；重开列表时筛选清空', () => {
    const matches = vi.fn((item: Item, needle: string) => item.id.includes(needle));
    const { unmount } = render(<Harness matches={matches} />);
    fireEvent.click(screen.getByTestId('wt-worktree-menu'));
    const filter = (): HTMLInputElement => screen.getByLabelText('Filter worktrees');

    fireEvent.change(filter(), { target: { value: '  FEATURE ' } });
    expect(matches).toHaveBeenCalledWith(ITEMS[0], 'feature');
    expect(rows().map(row => row.getAttribute('data-branch-id'))).toEqual(['feature/x']);

    fireEvent.change(filter(), { target: { value: 'no-such-worktree' } });
    expect(screen.getByTestId('wt-worktree-menu-popup').textContent).toContain('No matching worktrees');

    // 关了再开：筛选从空开始
    fireEvent.click(screen.getByTestId('wt-worktree-menu'));
    fireEvent.click(screen.getByTestId('wt-worktree-menu'));
    expect(filter().value).toBe('');
    expect(rows()).toHaveLength(2);
    unmount();

    render(<Harness initialMenuOpen items={[]} />);
    expect(screen.getByTestId('wt-worktree-menu-popup').textContent).toContain('No worktrees yet');
  });
});
