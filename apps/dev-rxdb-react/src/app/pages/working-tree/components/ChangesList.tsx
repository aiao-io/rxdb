import type { WorkingTreeDiff, WorkingTreeDiffEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { Check, ChevronDown, FileDiff, ListFilter, Search } from 'lucide-react';
import { createElement, useEffect, useRef, useState } from 'react';
import { diffEntryKey, formatPatchSummary } from '../utils/diff-format';
import { gdEntryPath, gdOpColor, gdOpIcon, gdPathColor, gdTableName } from '../utils/gd';

/** 列表行上的一次右键；`event` 给页面定位菜单用（与 Angular 参考实现的类型一致）。 */
export interface WorkingTreeContextMenuRequest<T> {
  readonly target: T;
  readonly event: React.MouseEvent;
}

/** 变更类型筛选的四个档位。 */
const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'insert', label: 'Added' },
  { value: 'update', label: 'Modified' },
  { value: 'delete', label: 'Deleted' }
] as const;

interface WorkingTreeChangesListProps {
  readonly diffState: WorkingTreeQueryState<WorkingTreeDiff>;
  readonly selectedKey: string | null;
  readonly onSelectEntry: (entry: WorkingTreeDiffEntry) => void;
  /** 行上右键；页面按条目拼菜单（复制 / 丢弃）。 */
  readonly onMenuRequest: (request: WorkingTreeContextMenuRequest<WorkingTreeDiffEntry>) => void;
}

/**
 * 「更改」标签页的文件列表，模仿 GitHub Desktop 的 Changes 列表。
 *
 * @remarks
 * 一条实体记录在这里就是一个文件，路径为 `schema/表名/主键`（优先 @Entity 的 tableName，查不到回退实体名）。
 * 类型筛选和路径/补丁文本筛选只影响列表，不改变待提交内容。
 * 筛选栏是**一个组合盒子**（GitHub Desktop 形态）：左侧漏斗图标按钮打开类型菜单
 * （全部 / 新增 / 修改 / 删除），分隔线右侧是放大镜 + 文本输入。
 *
 * 行是**可选中**的（选中键 = `diffEntryKey`），右栏的详情区跟随选中项——
 * 这正是 GitHub Desktop「左边点文件、右边看 diff」的轴。选中行是 GitHub Desktop
 * 的签名样式：3px 蓝左边条 + 浅蓝底（`.gd-row` / `.gd-row-selected` 见 styles.css）。
 * 行用 `role="button"` 的 div 而不是 `<button>`：模板里没有嵌套按钮，但保持与
 * 历史列表同一种键盘形态（Enter 选中），让两个列表的 a11y 行为一致。
 *
 * 没有暂存区（v1 硬裁决），所以行上没有 GitHub Desktop 的勾选框——列表只做「看」，
 * 「提交哪些」由提交框那句「提交全部未提交改动」说清。
 */
export function WorkingTreeChangesList({
  diffState,
  selectedKey,
  onMenuRequest,
  onSelectEntry
}: WorkingTreeChangesListProps): React.JSX.Element {
  const [filter, setFilter] = useState('');
  const [operation, setOperation] = useState<'all' | WorkingTreeDiffEntry['operation']>('all');
  const [kindOpen, setKindOpen] = useState(false);
  const kindContainerRef = useRef<HTMLDivElement>(null);

  // 点组合盒子之外关闭类型菜单（document 级，与 Angular 参考实现同款）。
  useEffect(() => {
    if (!kindOpen) return;
    const onDocumentClick = (event: MouseEvent): void => {
      if (!kindContainerRef.current?.contains(event.target as Node)) {
        setKindOpen(false);
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [kindOpen]);

  // 类型菜单开着时按 Escape：只收这一个弹层，不再往上冒（Angular 同款 stopPropagation）。
  useEffect(() => {
    if (!kindOpen) return;
    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setKindOpen(false);
      }
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [kindOpen]);

  const setFilterFromEvent = (event: React.ChangeEvent<HTMLInputElement>) => setFilter(event.target.value);

  const selectOperation = (value: 'all' | WorkingTreeDiffEntry['operation']) => {
    setOperation(value);
    setKindOpen(false);
  };

  /** 当前类型的展示名（漏斗按钮的 title 用）。 */
  const kindLabel = KINDS.find(kind => kind.value === operation)?.label ?? 'All';

  const entries = diffState.phase === 'success' ? diffState.value.entries : [];
  const needle = filter.trim().toLowerCase();
  const filteredEntries = entries.filter(
    entry =>
      (operation === 'all' || entry.operation === operation) &&
      `${gdEntryPath(entry)} ${formatPatchSummary(entry)}`.toLowerCase().includes(needle)
  );

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='gd-filter-bar'>
        <div className='gd-filter-combo'>
          <div className='relative flex shrink-0' ref={kindContainerRef}>
            <button
              className='gd-filter-kind-btn'
              aria-expanded={kindOpen}
              title={`Change type: ${kindLabel}`}
              onClick={() => setKindOpen(open => !open)}
              aria-haspopup={true}
              data-testid='wt-filter-kind'
              type='button'
            >
              <ListFilter size={14} />
              <ChevronDown size={10} />
            </button>
            {kindOpen && (
              <div
                className='gd-menu absolute top-full left-0 z-40 mt-1 w-36 py-1'
                aria-label='Change type'
                data-testid='wt-filter-kind-popup'
                role='menu'
              >
                {KINDS.map(kind => (
                  <button
                    className='gd-menu-row'
                    data-testid={`wt-filter-kind-${kind.value}`}
                    key={kind.value}
                    onClick={() => selectOperation(kind.value)}
                    role='menuitem'
                    type='button'
                  >
                    {kind.label}
                    {operation === kind.value && (
                      <Check className='ml-auto shrink-0 text-[var(--gd-accent)]' size={13} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className='gd-filter-search'>
            <Search size={14} />
            <input
              aria-label='Filter changes'
              data-testid='wt-change-filter'
              onChange={setFilterFromEvent}
              placeholder='Filter'
              type='search'
              value={filter}
            />
          </label>
        </div>
      </div>
      <div className='gd-files-count'>{filteredEntries.length} changed files</div>
      <div className='min-h-0 flex-1 overflow-y-auto' aria-live='polite' data-testid='wt-diff-result'>
        {/* 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only */}
        <span className='sr-only' data-testid='wt-diff-phase'>
          {diffState.phase}
        </span>
        {diffState.phase === 'empty' ?
          <div className='gd-empty py-10 text-xs'>
            <FileDiff className='text-[var(--gd-line-num)]' size={28} />
            <p>No local changes</p>
            <p className='text-xs'>Data written on other pages (like Todo) shows up here as uncommitted changes</p>
          </div>
        : diffState.phase === 'success' ?
          <ul data-testid='wt-diff-list'>
            {filteredEntries.map(entry => (
              <li key={diffEntryKey(entry)}>
                <div
                  className={`gd-row${selectedKey === diffEntryKey(entry) ? 'gd-row-selected' : ''}`}
                  aria-current={selectedKey === diffEntryKey(entry) ? 'true' : undefined}
                  data-diff-key={diffEntryKey(entry)}
                  onClick={() => onSelectEntry(entry)}
                  onContextMenu={event => onMenuRequest({ target: entry, event })}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onSelectEntry(entry);
                  }}
                  data-testid='wt-diff-item'
                  role='button'
                  tabIndex={0}
                >
                  <div
                    className='flex min-w-0 items-center gap-2'
                    title={`${gdEntryPath(entry)} · ${formatPatchSummary(entry)}`}
                  >
                    {/* 路径中间省略（GitHub Desktop 的文件列表同款）：前缀段照常截断，id 尾部保留结尾 */}
                    <span
                      className='gd-file-name flex min-w-0 flex-1 items-center'
                      style={{ color: gdPathColor(entry.operation) }}
                    >
                      {/* schema/实体 前缀永不省略（Todo 必须完整可见），只有 uuid 前段省略 */}
                      <span className='shrink-0'>
                        {entry.namespace}/{gdTableName(entry.entity)}/
                      </span>
                      <span className='gd-truncate-tail min-w-0'>
                        <span>{entry.entityId}</span>
                      </span>
                    </span>
                    {createElement(gdOpIcon(entry.operation), {
                      className: 'shrink-0',
                      size: 16,
                      style: { color: gdOpColor(entry.operation) }
                    })}
                  </div>
                </div>
              </li>
            ))}
            {filteredEntries.length === 0 && <li className='gd-empty py-8 text-xs'>No matching changes</li>}
          </ul>
        : null}
      </div>
    </div>
  );
}
