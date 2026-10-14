import clsx from 'clsx';
import { Check, ChevronDown, Plus, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { isImeComposing } from '../utils/ime';

/**
 * 共享下拉的 test id 前缀：分支菜单 `wt-branch`，worktree 菜单 `wt-worktree`。
 *
 * @remarks
 * 组件里的 test id 都是「前缀 + 后缀」拼出来的，按完整 id（如 `wt-worktree-list-retry`）grep 会落空，
 * 所以后缀表写在这里：
 *
 * | 后缀                                  | 元素                                                     |
 * | ------------------------------------- | -------------------------------------------------------- |
 * | `-menu`                               | 触发按钮                                                 |
 * | `-current`                            | 触发按钮上的粗体值                                       |
 * | `-menu-popup`                         | 列表弹层（同时是它的 `id`，即触发按钮的 `aria-controls`） |
 * | `-create`                             | 列表头的「New …」按钮                                    |
 * | `-create-popover`                     | 创建弹层                                                 |
 * | `-create-cancel` / `-create-confirm`  | 创建弹层的取消 / 确认                                    |
 * | `-item`                               | 行按钮（带 `data-branch-id`，e2e 按它取行）              |
 * | `-label-text`                         | 行按钮里的名字                                           |
 * | `-list-error` / `-list-retry`         | 列表读失败的错误块 / 它的 Retry 按钮                     |
 */
export type WorktreeToolbarDropdownTestIdPrefix = 'wt-branch' | 'wt-worktree';

/** 一个下拉的界面文案；两个包装组件各定义一份常量，原文照搬改造前的模板。 */
export interface WorktreeToolbarDropdownCopy {
  /** 触发按钮上的小字（`Current Branch`） */
  readonly caption: string;
  /** 列表头（`Branches`），后面拼条数 */
  readonly heading: string;
  /** 列表头的新建按钮（`New branch`） */
  readonly createButton: string;
  /** 创建弹层的可访问名（`Create a branch`）；可见标题由包装组件的创建表单自己画 */
  readonly createTitle: string;
  /** 筛选框的可访问名（`Filter branches`） */
  readonly filterLabel: string;
  /** 筛选框占位（`Filter`） */
  readonly filterPlaceholder: string;
  /** 列表弹层的可访问名（`Branch list`） */
  readonly listLabel: string;
  /** 背板的可访问名（`Close branch menu`；e2e 点它关菜单） */
  readonly backdropLabel: string;
  /** 一条都没有（`No branches yet`） */
  readonly emptyText: string;
  /** 筛空（`No matching branches`） */
  readonly noMatchText: string;
}

/** 行操作插槽拿到的上下文。 */
export interface WorktreeToolbarDropdownRowContext {
  /** 有命令在途：行操作按钮应当一并禁用 */
  readonly busy: boolean;
}

/** {@link WorktreeToolbarDropdown} 的入参。 */
export interface WorktreeToolbarDropdownProps<T> {
  /** test id 前缀，后缀表见 {@link WorktreeToolbarDropdownTestIdPrefix} */
  readonly testIdPrefix: WorktreeToolbarDropdownTestIdPrefix;
  /** 界面文案 */
  readonly copy: WorktreeToolbarDropdownCopy;
  /** 触发按钮与非当前行的前导图标 */
  readonly icon: LucideIcon;
  /** 触发按钮上的粗体值；空串显示 `…` */
  readonly value: string;
  /** 两个弹层的宽度 */
  readonly popupWidth: number;
  /** 列表条目 */
  readonly items: readonly T[];
  /** 条目的 React key */
  readonly itemKey: (item: T) => string;
  /** 行上显示的名字 */
  readonly itemLabel: (item: T) => string;
  /** 行按钮上的 `data-branch-id` */
  readonly itemBranchId: (item: T) => string;
  /** 是不是当前项：前导图标换成勾、名字变绿、带 `aria-current="true"`，点它只收起菜单 */
  readonly isActive: (item: T) => boolean;
  /** 筛选谓词；`needle` 已 trim + 小写，且非空 */
  readonly matches: (item: T, needle: string) => boolean;
  /** 有命令在途：新建按钮、每一行与创建按钮都禁用，确认直接返回 */
  readonly busy: boolean;
  /** 列表读失败的文案；非 null 时列表换成错误块 + Retry，新建禁用 */
  readonly listError: string | null;
  /** 创建弹层里的就地错误 */
  readonly createError: string | null;
  /** 它一变（如 worktree 菜单切了模式）就重新把焦点送进创建弹层里的 `[data-autofocus]` */
  readonly createFocusKey: string;
  /** 列表弹层开合；创建弹层打开时恒为 false（两态互斥，避免两个弹层叠着） */
  readonly menuOpen: boolean;
  /** 创建弹层开合 */
  readonly createOpen: boolean;
  /** 列表弹层开合的回写 */
  readonly onMenuOpenChange: (open: boolean) => void;
  /** 创建弹层开合的回写 */
  readonly onCreateOpenChange: (open: boolean) => void;
  /** 点了一行非当前项（当前项只收起菜单，不发这个事件） */
  readonly onSelect: (item: T) => void;
  /** 行上右键（分支菜单靠它拼行菜单） */
  readonly onRowContextMenu?: (item: T, event: React.MouseEvent<HTMLButtonElement>) => void;
  /** 创建弹层即将打开：包装组件在这里重置表单 */
  readonly onCreateOpening: () => void;
  /** 创建确认（确认按钮，或文本框里的回车）；在途时不发 */
  readonly onConfirm: () => void;
  /** 错误块里的 Retry */
  readonly onRetry?: () => void;
  /** 行内名字之后的附加信息 */
  readonly renderRowMeta: (item: T) => ReactNode;
  /** 行右端、与行按钮并列的操作（`<button>` 里套 `<button>` 是非法 HTML，读屏与键盘都会走丢） */
  readonly renderRowActions?: (item: T, context: WorktreeToolbarDropdownRowContext) => ReactNode;
  /** 创建弹层的表单本体（标题 + 输入控件）；错误行与取消 / 确认按钮由本组件画 */
  readonly createBody: ReactNode;
}

/**
 * 工具栏下拉（分支菜单与 worktree 菜单共用），模仿 GitHub Desktop 的分支下拉。
 *
 * @remarks
 * 开合状态机、背板、Escape、回车提交、焦点、筛选、ARIA、列表错误块与在途禁用都只在这里写一遍；
 * 包装组件只给文案、条目的读法与三个插槽（行附加信息、行操作、创建表单），自己不处理任何按键。
 *
 * 下拉与创建弹层都是**内联**渲染（absolute 定位在按钮下方）而不是 overlay：overlay 会把节点
 * 追加到 `<body>` 末尾，Tab 顺序上排在整页面板之后——键盘用户从触发按钮按 Tab 会直接跳进侧栏，
 * 永远走不进下拉。内联渲染让「按钮 → 新建 → 筛选框 → 行」落在自然 DOM 顺序里，a11y 用例的
 * 纯 Tab 走查才走得通。
 *
 * **下拉必须左对齐（`left-0`）而不是右对齐。** 应用壳的侧栏展开后占 240px，滚动容器里的右对齐
 * 下拉会向左伸进侧栏区域被裁剪——裁掉的那块恰好是操作按钮的位置，点击会被 fixed 背板吃掉
 * （Angular 端 2026-09-18 实测复现，见 e2e）。
 *
 * ARIA：列表弹层是非模态的 `role="dialog"`，行是 `<ul>/<li>` 里的普通 `<button>`——弹层里还有
 * 筛选框与新建按钮，`role="menu"` 只许装菜单项；当前项的行按钮带 `aria-current="true"`。
 * 创建弹层同样是不带 `aria-modal` 的 `role="dialog"`。
 */
export function WorktreeToolbarDropdown<T>({
  busy,
  copy,
  createBody,
  createError,
  createFocusKey,
  createOpen,
  icon: Icon,
  isActive,
  itemBranchId,
  itemKey,
  itemLabel,
  items,
  listError,
  matches,
  menuOpen,
  popupWidth,
  testIdPrefix,
  value,
  onConfirm,
  onCreateOpenChange,
  onCreateOpening,
  onMenuOpenChange,
  onRetry,
  onRowContextMenu,
  onSelect,
  renderRowActions,
  renderRowMeta
}: WorktreeToolbarDropdownProps<T>): React.JSX.Element {
  /** 筛选文本（大小写不敏感的子串匹配）；每次打开列表都从空开始。 */
  const [filter, setFilter] = useState('');
  const createPopoverRef = useRef<HTMLDivElement>(null);
  const popupId = `${testIdPrefix}-menu-popup`;

  const closeAll = () => {
    onMenuOpenChange(false);
    onCreateOpenChange(false);
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeAll();
      return;
    }
    // 筛选在打开时清空而不是关闭时：页面也会替菜单收起（切换之后），那条路不经过这里。
    setFilter('');
    onCreateOpenChange(false);
    onMenuOpenChange(true);
  };

  /** 新建：先收起列表，让包装组件重置表单，再开创建弹层。 */
  const openCreate = () => {
    onMenuOpenChange(false);
    onCreateOpening();
    onCreateOpenChange(true);
  };

  /** 点行：非当前项交给包装组件（GitHub Desktop 同款的点行即切换），当前项只收起菜单。 */
  const selectRow = (item: T) => {
    if (isActive(item)) {
      closeAll();
      return;
    }
    onSelect(item);
  };

  const confirm = () => {
    if (busy) return;
    onConfirm();
  };

  // 回车提交只在这一处：只认文本框里的回车。按钮上的回车本来就会触发原生 click，这里再确认一次
  // 就是双提交；组字中的回车是在确认候选词，不是提交。
  const onCreateKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || isImeComposing(event.nativeEvent)) return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'text') confirm();
  };

  // Escape 走 document 级监听而不是挂在容器 div 上：焦点在弹层任意子元素上时事件都能冒泡到
  // document，而容器 div 挂交互 handler 会撞 jsx-a11y 的 interactive-supports-focus（div 不可聚焦）。
  // 两个菜单各挂一个：没开着的那个什么都不做；组字中的 Escape 是在取消组字，也不收。
  const onDocumentKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !(menuOpen || createOpen) || isImeComposing(event)) return;
    closeAll();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => onDocumentKeyDown(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // 创建弹层一出现、或表单换了形态，就把焦点送进 [data-autofocus]：创建是两步操作，
  // 第二步不能靠用户自己再点一下输入框。
  useEffect(() => {
    if (!createOpen) return;
    createPopoverRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [createOpen, createFocusKey]);

  // 筛出来的条目；空筛选 = 全量。
  const needle = filter.trim().toLowerCase();
  const visibleItems = needle === '' ? items : items.filter(item => matches(item, needle));
  const placeholder =
    items.length === 0 ? copy.emptyText
    : visibleItems.length === 0 ? copy.noMatchText
    : null;

  return (
    <div className='flex h-full items-stretch'>
      <div className='relative flex-1'>
        <button
          className='gd-toolbar-select'
          aria-controls={popupId}
          aria-expanded={menuOpen}
          aria-haspopup='dialog'
          onClick={toggleMenu}
          data-testid={`${testIdPrefix}-menu`}
          type='button'
        >
          <Icon size={18} />
          <span className='min-w-0 flex-1 text-left'>
            <small>{copy.caption}</small>
            <strong className='truncate' data-testid={`${testIdPrefix}-current`}>
              {value || '…'}
            </strong>
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
            aria-label={copy.backdropLabel}
            role='button'
            tabIndex={0}
          ></div>
        : null}

        {createOpen ?
          <div
            className='gd-menu gd-menu-flush gd-branch-create-popover absolute top-full left-0 z-40 mt-1'
            style={{ width: popupWidth }}
            ref={createPopoverRef}
            aria-label={copy.createTitle}
            onKeyDown={onCreateKeyDown}
            data-testid={`${testIdPrefix}-create-popover`}
            role='dialog'
          >
            <div className='flex flex-col gap-2'>
              {createBody}
              {createError !== null && (
                <p className='text-xs text-red-600' role='alert'>
                  {createError}
                </p>
              )}
              <div className='flex justify-end gap-2'>
                <button
                  className='gd-btn-secondary'
                  onClick={closeAll}
                  data-testid={`${testIdPrefix}-create-cancel`}
                  type='button'
                >
                  Cancel
                </button>
                <button
                  className='gd-btn-primary'
                  disabled={busy}
                  onClick={confirm}
                  data-testid={`${testIdPrefix}-create-confirm`}
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
            aria-label={copy.listLabel}
            data-testid={popupId}
            id={popupId}
            role='dialog'
          >
            <div className='flex items-center justify-between px-3 pt-1 pb-1.5'>
              <span className='text-[11px] font-semibold uppercase' style={{ color: 'var(--gd-muted)' }}>
                {copy.heading} ({items.length})
              </span>
              <button
                className='gd-btn-ghost shrink-0'
                disabled={busy || listError !== null}
                onClick={openCreate}
                data-testid={`${testIdPrefix}-create`}
                type='button'
              >
                <Plus size={12} />
                {copy.createButton}
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
                aria-label={copy.filterLabel}
                onChange={event => setFilter(event.target.value)}
                placeholder={copy.filterPlaceholder}
                type='text'
                value={filter}
              />
            </div>
            {/* 读失败时错误块整个替换掉列表：`<ul>` 里放 `<li role="alert">` 过不了 axe 的 list 规则 */}
            {listError !== null ?
              <div
                className='gd-warn-strip mx-2 flex items-center gap-2 rounded'
                data-testid={`${testIdPrefix}-list-error`}
                role='alert'
              >
                <span className='min-w-0 flex-1'>{listError}</span>
                <button
                  className='gd-btn-secondary shrink-0'
                  onClick={onRetry}
                  data-testid={`${testIdPrefix}-list-retry`}
                  type='button'
                >
                  Retry
                </button>
              </div>
            : <ul className='min-h-0 flex-1 overflow-y-auto py-1'>
                {visibleItems.map(item => {
                  const active = isActive(item);
                  return (
                    <li key={itemKey(item)}>
                      <div className='flex items-stretch'>
                        <button
                          className='gd-menu-row min-w-0 flex-1'
                          aria-current={active || undefined}
                          data-branch-id={itemBranchId(item)}
                          disabled={busy}
                          onClick={() => selectRow(item)}
                          onContextMenu={event => onRowContextMenu?.(item, event)}
                          data-testid={`${testIdPrefix}-item`}
                          type='button'
                        >
                          {/* 当前项：前导图标换成勾（GitHub Desktop 同款） */}
                          {active ?
                            <Check className='shrink-0' size={12} style={{ color: 'var(--gd-accent)' }} />
                          : <Icon className='shrink-0' size={12} />}
                          <span
                            className={clsx('min-w-0 flex-1 truncate text-sm font-medium', {
                              'text-green-700': active
                            })}
                            data-testid={`${testIdPrefix}-label-text`}
                          >
                            {itemLabel(item)}
                          </span>
                          {renderRowMeta(item)}
                        </button>
                        {renderRowActions?.(item, { busy })}
                      </div>
                    </li>
                  );
                })}
                {placeholder !== null && (
                  <li className='px-4 py-4 text-center text-sm' style={{ color: 'var(--gd-muted)' }}>
                    {placeholder}
                  </li>
                )}
              </ul>
            }
          </div>
        : null}
      </div>
    </div>
  );
}
