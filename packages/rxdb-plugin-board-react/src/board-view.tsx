'use client';

import type { UUID } from '@aiao/rxdb';
import {
  Column,
  labelTextColor,
  resolveCardDrop,
  resolveColumnDrop,
  resolveMenuMove,
  RESTORING_MARKER_KEY,
  Task,
  type BoardLabel,
  type BoardSearchUpstream,
  type CardDropColumnView,
  type CardDropTarget,
  type DeletePlan,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Subscription } from 'rxjs';
import './board-view.css';

import { useBoard } from './use-board.js';

/**
 * 看板视图组件（US-539 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
 * 标签管理 + 撤销重做 + 备份入口占位 + 删除确认。
 *
 * 三端只采集指针事件，落点换算调用核心包同一份 `resolveCardDrop` /
 * `resolveColumnDrop`；全部写入口经 {@link useBoard} 的领域动作。
 * 与 Angular / Vue 同功能同领域 API（交互约定见 US-539）。
 */
export interface BoardViewProps {
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  readonly rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  readonly onExportBackup?: () => void | Promise<void>;
}

type DueFilter = 'all' | 'overdue' | 'today' | 'upcoming';
type ComposerKind = 'board' | 'column' | 'label';

interface ParsedFilter {
  readonly text: string;
  readonly label: string;
  readonly due: DueFilter;
}

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dueState = (task: Task, today: string): Exclude<DueFilter, 'all'> | 'none' => {
  if (!task.dueDate) return 'none';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'today';
  return 'upcoming';
};

const parseFilter = (value: string): ParsedFilter => {
  let text = value;
  let label = '';
  let due: DueFilter = 'all';
  const labelMatch = text.match(/(?:^|\s)label:(?:"([^"]+)"|(\S+))/i);
  if (labelMatch) {
    label = labelMatch[1] ?? labelMatch[2] ?? '';
    text = text.replace(labelMatch[0], ' ');
  }
  const dueMatch = text.match(/(?:^|\s)due:(overdue|today|upcoming|all)(?=\s|$)/i);
  if (dueMatch) {
    due = dueMatch[1].toLowerCase() as DueFilter;
    text = text.replace(dueMatch[0], ' ');
  }
  return { text: text.trim().replace(/\s+/g, ' '), label: label.trim(), due };
};

export function BoardView({ rxdb, onExportBackup }: BoardViewProps): ReactNode {
  const searchUpstream = rxdb.getPlugins('search')[0];
  const board = useBoard(
    rxdb,
    searchUpstream ? { search: { upstream: searchUpstream as unknown as BoardSearchUpstream } } : undefined
  );
  const [editTitleTaskId, setEditTitleTaskId] = useState<UUID | null>(null);
  const [editTitleValue, setEditTitleValue] = useState<string>('');
  const [detailTaskId, setDetailTaskId] = useState<UUID | null>(null);
  const [detailPinned, setDetailPinned] = useState(false);
  const [detailActionsOpen, setDetailActionsOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<UUID | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '', labelIds: [] as readonly UUID[] });
  const [snapshot, setSnapshot] = useState<TaskDraftSnapshot | null>(null);
  const [confirm, setConfirm] = useState<DeletePlan | null>(null);
  const detailRequestRef = useRef(0);
  const pendingDetailRef = useRef<UUID | null>(null);
  const invalidateDetailRequest = (): void => {
    detailRequestRef.current += 1;
    pendingDetailRef.current = null;
  };
  const detailStateRef = useRef({ draft, snapshot, boardId: board.currentBoardId, taskId: detailTaskId });
  detailStateRef.current = { draft, snapshot, boardId: board.currentBoardId, taskId: detailTaskId };

  // ---------- 板内搜索（US-539 阶段 B） ----------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [searchResults, setSearchResults] = useState<readonly SearchResult[]>([]);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchErrorText, setSearchErrorText] = useState<string | null>(null);
  const [searchHighlightId, setSearchHighlightId] = useState<UUID | null>(null);
  const [filterLabelId, setFilterLabelId] = useState<UUID | ''>('');
  const [filterLabelText, setFilterLabelText] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [showEmptyColumns, setShowEmptyColumns] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filterSuggestionsOpen, setFilterSuggestionsOpen] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [openColumnMenuId, setOpenColumnMenuId] = useState<UUID | null>(null);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [composerColor, setComposerColor] = useState('#e11d48');
  const [composerSaving, setComposerSaving] = useState(false);
  const [editingBoard, setEditingBoard] = useState(false);
  const [editingBoardValue, setEditingBoardValue] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<UUID | null>(null);
  const [editingColumnValue, setEditingColumnValue] = useState('');
  const [editingLabelId, setEditingLabelId] = useState<UUID | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState('');
  /** 拖拽落点反馈（GitHub Projects 同款：插入线 / 列高亮 / 源卡片半透明）。 */
  const [dragging, setDragging] = useState<{ readonly kind: 'task' | 'column'; readonly id: UUID } | null>(null);
  const [dropTarget, setDropTarget] = useState<
    | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
    | { readonly kind: 'task-end'; readonly columnId: UUID }
    | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' }
    | null
  >(null);
  const searchHandleRef = useRef<SearchHandle | null>(null);
  const searchSubsRef = useRef<Subscription | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const destroySearch = (): void => {
    searchSubsRef.current?.unsubscribe();
    searchSubsRef.current = null;
    searchHandleRef.current?.destroy();
    searchHandleRef.current = null;
    setSearchState('idle');
    setSearchResults([]);
    setSearchHasMore(false);
    setSearchErrorText(null);
  };

  const onSearchInput = (value: string): void => {
    setSearchQuery(value);
    const parsed = parseFilter(value);
    setFilterLabelText(parsed.label);
    setFilterLabelId(
      parsed.label === '' ?
        ''
      : (board.labels.find(label => label.name.toLowerCase() === parsed.label.toLowerCase())?.id ?? '')
    );
    setDueFilter(parsed.due);
    const query = parsed.text;
    if (query === '') {
      destroySearch();
      return;
    }
    const source = board.searchSource;
    if (!source) return;
    if (searchHandleRef.current === null) {
      const handle = source.search(query);
      searchHandleRef.current = handle;
      // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
      searchSubsRef.current?.unsubscribe();
      const subs = new Subscription();
      subs.add(handle.state$.subscribe(state => setSearchState(state)));
      subs.add(handle.results$.subscribe(results => setSearchResults(results)));
      subs.add(handle.hasMore$.subscribe(more => setSearchHasMore(more)));
      subs.add(handle.error$.subscribe(error => setSearchErrorText(String(error))));
      searchSubsRef.current = subs;
    } else {
      searchHandleRef.current.setQuery(query);
    }
  };

  /** 点结果：滚动到目标卡片并短暂高亮（更新中不可点）。 */
  const onSearchResultClick = (result: SearchResult): void => {
    if (searchState === 'loading') return;
    document.querySelector<HTMLElement>(`[data-task-id="${result.id}"]`)?.scrollIntoView({ block: 'center' });
    const targetId = result.id as UUID;
    setSearchHighlightId(targetId);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setSearchHighlightId(current => (current === targetId ? null : current));
    }, 2000);
  };

  useEffect(
    () => () => {
      detailRequestRef.current += 1;
      pendingDetailRef.current = null;
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      searchSubsRef.current?.unsubscribe();
      searchHandleRef.current?.destroy();
    },
    []
  );

  // 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
  useEffect(() => {
    const apply = (): void => {
      board.setRestoring(typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null);
    };
    apply();
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, [board]);
  const [notice, setNotice] = useState<string | null>(null);

  const taskMap = useMemo(() => {
    const grouped = new Map<UUID, Task[]>();
    for (const column of board.columns) grouped.set(column.id, []);
    for (const task of board.tasks) {
      const list = grouped.get(task.columnId) ?? [];
      list.push(task);
      grouped.set(task.columnId, list);
    }
    return grouped;
  }, [board.columns, board.tasks]);

  const today = dateKey(new Date());
  const visibleTasks = useMemo(
    () =>
      board.tasks.filter(task => {
        const matchesLabel =
          filterLabelText === '' && filterLabelId === '' ?
            true
          : (board.taskLabels.get(task.id) ?? []).some(label =>
              filterLabelId !== '' ?
                label.id === filterLabelId
              : label.name.toLowerCase() === filterLabelText.toLowerCase()
            );
        const state = dueState(task, today);
        return matchesLabel && (dueFilter === 'all' || state === dueFilter);
      }),
    [board.taskLabels, board.tasks, dueFilter, filterLabelId, filterLabelText, today]
  );
  const visibleTaskMap = useMemo(() => {
    const grouped = new Map<UUID, Task[]>();
    for (const column of board.columns) grouped.set(column.id, []);
    for (const task of visibleTasks) {
      const list = grouped.get(task.columnId) ?? [];
      list.push(task);
      grouped.set(task.columnId, list);
    }
    return grouped;
  }, [board.columns, visibleTasks]);
  const visibleColumns = useMemo(
    () =>
      showEmptyColumns ?
        board.columns
      : board.columns.filter(column => (visibleTaskMap.get(column.id) ?? []).length > 0),
    [board.columns, showEmptyColumns, visibleTaskMap]
  );
  const activeFilterCount = (filterLabelText === '' ? 0 : 1) + (dueFilter === 'all' ? 0 : 1);
  const overdueTaskCount = board.tasks.filter(task => dueState(task, today) === 'overdue').length;

  const noticeTimerRef = useRef<number | null>(null);
  const scheduleNoticeClear = (): void => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
  };

  const guard = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    try {
      setNotice(null);
      return await operation();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      scheduleNoticeClear();
      return undefined;
    }
  };

  const startComposer = (kind: ComposerKind): void => {
    if (composerSaving) return;
    setComposer(current => (current === kind ? null : kind));
    setComposerValue('');
    setComposerColor('#e11d48');
  };

  const cancelComposer = (): void => {
    if (composerSaving) return;
    setComposer(null);
    setComposerValue('');
    setComposerColor('#e11d48');
  };

  const submitComposer = async (): Promise<void> => {
    const value = composerValue.trim();
    if (composer === null || value === '' || composerSaving) return;
    setComposerSaving(true);
    try {
      let created = false;
      if (composer === 'board') {
        created = (await guard(() => board.actions.createBoard({ title: value }))) !== undefined;
      } else if (composer === 'column') {
        created = (await guard(() => board.actions.createColumn({ title: value }))) !== undefined;
      } else {
        created =
          (await guard(() => board.actions.createLabel({ name: value, color: composerColor.trim() }))) !== undefined;
      }
      if (created) cancelComposer();
    } finally {
      setComposerSaving(false);
    }
  };

  const startBoardEdit = (): void => {
    if (!current) return;
    setEditingBoardValue(current.title);
    setEditingBoard(true);
  };

  const commitBoardEdit = async (): Promise<void> => {
    if (!current) return;
    const result = await guard(() => board.actions.updateBoard(current.id, { title: editingBoardValue }));
    if (result !== undefined) setEditingBoard(false);
  };

  const startColumnEdit = (column: Column): void => {
    setEditingColumnId(column.id);
    setEditingColumnValue(column.title);
    setOpenColumnMenuId(null);
  };

  const commitColumnEdit = async (column: Column): Promise<void> => {
    const result = await guard(() => board.actions.updateColumn(column.id, { title: editingColumnValue }));
    if (result !== undefined) setEditingColumnId(null);
  };

  const startLabelEdit = (label: BoardLabel): void => {
    setEditingLabelId(label.id);
    setEditingLabelValue(label.name);
  };

  const commitLabelEdit = async (label: BoardLabel): Promise<void> => {
    const result = await guard(() => board.actions.renameLabel(label.id, editingLabelValue));
    if (result !== undefined) setEditingLabelId(null);
  };

  /** 内联建任务（GitHub Projects 同款：列底输入框，Enter 提交 / Esc 取消）。 */
  const [addTaskColumnId, setAddTaskColumnId] = useState<UUID | null>(null);
  const [addTaskTitle, setAddTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);
  const creatingTaskRef = useRef(false);

  /** 写入口 busy 状态（US-539 交互约定「写入」行：执行中阻止重复提交）。 */
  const [savingDetail, setSavingDetail] = useState(false);
  const [sortingColumnId, setSortingColumnId] = useState<UUID | null>(null);

  const cancelAddTask = (): void => {
    if (creatingTaskRef.current) return;
    setAddTaskColumnId(null);
    setAddTaskTitle('');
  };

  const commitAddTask = async (): Promise<void> => {
    if (creatingTaskRef.current) return;
    const title = addTaskTitle.trim();
    if (addTaskColumnId === null || title === '') {
      cancelAddTask();
      return;
    }
    creatingTaskRef.current = true;
    setCreatingTask(true);
    try {
      const created = await guard(() => board.actions.createTask({ columnId: addTaskColumnId, title }));
      if (created !== undefined) {
        setAddTaskColumnId(null);
        setAddTaskTitle('');
      }
    } finally {
      creatingTaskRef.current = false;
      setCreatingTask(false);
    }
  };

  const startEditTitle = (task: Task): void => {
    setEditTitleValue(task.title);
    setEditTitleTaskId(task.id);
  };
  const commitEditTitle = async (task: Task): Promise<void> => {
    const result = await guard(() => board.actions.updateTaskTitle(task.id, editTitleValue));
    // 失败（空标题等）保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
    if (result === undefined) return;
    setEditTitleTaskId(null);
  };

  const onTaskDragStart = (event: DragEvent, task: Task): void => {
    // dataTransfer 在合成事件（e2e dispatchEvent）下为 null，与 Angular / Vue 同款可选链
    event.dataTransfer?.setData('application/x-board-task', task.id);
    setDragging({ kind: 'task', id: task.id });
  };
  const onColumnDragStart = (event: DragEvent, column: Column): void => {
    event.dataTransfer?.setData('application/x-board-column', column.id);
    setDragging({ kind: 'column', id: column.id });
  };

  /** 卡片落点反馈：dragover 时预计算落点并标在目标卡片 / 空列上。 */
  const onTaskDragOver = (event: DragEvent): void => {
    // 列头 handler 在任务 handler 的祖先链外层会冒泡到这里，按拖拽类型分流，
    // 否则列拖拽的落点会被任务换算覆盖（列插入线永远不可见）
    event.preventDefault();
    if (dragging?.kind !== 'task') return;
    const movedId = dragging.id;
    const target = resolveCardDrop(columnViews(), movedId, event.clientX, event.clientY);
    if (!target) {
      setDropTarget(null);
      return;
    }
    setDropTarget(
      target.kind === 'end' ?
        { kind: 'task-end', columnId: target.columnId }
      : {
          kind: 'task',
          columnId: target.columnId,
          mode: target.prevId === null ? 'before' : 'after',
          taskId: (target.prevId ?? target.nextId)!
        }
    );
  };

  /** 列头落点反馈：列间插入线。 */
  const onColumnDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (dragging?.kind !== 'column') return;
    const movedId = dragging.id;
    const target = resolveColumnDrop(
      board.columns.map(column => ({
        columnId: column.id,
        rect: (() => {
          const header = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
          const rect = header?.getBoundingClientRect();
          return { left: rect?.left ?? 0, right: rect?.right ?? 0 };
        })()
      })),
      board.columns.map(column => column.id),
      movedId,
      event.clientX
    );
    if (!target) {
      setDropTarget(null);
      return;
    }
    const anchorId = target.prevId ?? target.nextId;
    if (anchorId === null) {
      setDropTarget(null);
      return;
    }
    setDropTarget({ kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' });
  };

  const clearDragFeedback = (): void => {
    setDragging(null);
    setDropTarget(null);
  };

  const columnViews = (): CardDropColumnView[] =>
    board.columns.map(column => {
      const columnEl = document.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`);
      const rect = columnEl?.getBoundingClientRect();
      const cards = (taskMap.get(column.id) ?? []).map(task => {
        const cardEl = document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
        const cardRect = cardEl?.getBoundingClientRect();
        return { id: task.id, top: cardRect?.top ?? 0, bottom: cardRect?.bottom ?? 0 };
      });
      return {
        columnId: column.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: (taskMap.get(column.id) ?? []).map(task => task.id)
      };
    });

  const resolveTaskTarget = (movedId: UUID, clientX: number, clientY: number): CardDropTarget | null =>
    resolveCardDrop(columnViews(), movedId, clientX, clientY);

  const resolveColumnTarget = (
    movedId: UUID,
    clientX: number
  ): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
    const views = board.columns.map(column => {
      const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    const target = resolveColumnDrop(
      views,
      board.columns.map(column => column.id),
      movedId,
      clientX
    );
    return target ? { prevId: target.prevId as UUID, nextId: target.nextId as UUID } : null;
  };

  const moveTaskAndSyncDetail = async (taskId: UUID, target: CardDropTarget): Promise<void> => {
    const before = detailStateRef.current;
    const request = detailRequestRef.current;
    await board.actions.moveTask(taskId, target);
    if (request !== detailRequestRef.current || before.taskId !== taskId) return;
    setSnapshot(current =>
      current !== null && current === before.snapshot ? { ...current, columnId: target.columnId } : current
    );
  };

  const onTaskDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    const movedId = event.dataTransfer?.getData('application/x-board-task') as UUID | undefined;
    if (!movedId) return;
    clearDragFeedback();
    const target = resolveTaskTarget(movedId, event.clientX, event.clientY);
    if (!target) return;
    await guard(() => moveTaskAndSyncDetail(movedId, target));
  };

  const onColumnDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    const movedId = event.dataTransfer?.getData('application/x-board-column') as UUID | undefined;
    if (!movedId) return;
    clearDragFeedback();
    const target = resolveColumnTarget(movedId, event.clientX);
    if (!target) return;
    await guard(() => board.actions.moveColumn(movedId, target));
  };

  const sortColumnBy = async (columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> => {
    if (sortingColumnId !== null) return;
    setSortingColumnId(columnId);
    try {
      const result = await guard(() => board.actions.sortColumn(columnId, mode));
      if (result && !result.written) setNotice('已按目标顺序排列，无变化');
    } finally {
      setSortingColumnId(null);
    }
  };

  const openDetail = async (taskId: UUID): Promise<void> => {
    if (detailTaskId === taskId) {
      invalidateDetailRequest();
      return;
    }
    if (isDetailDirty() && !window.confirm('有未保存的修改，打开其它任务将放弃。继续？')) return;
    const request = ++detailRequestRef.current;
    pendingDetailRef.current = taskId;
    const boardId = board.currentBoardId;
    const previousDraft = JSON.stringify(draft);
    const snap = await guard(() => board.actions.openSnapshot(taskId));
    if (request !== detailRequestRef.current) return;
    pendingDetailRef.current = null;
    if (snap === undefined) return;
    if (previousDraft !== JSON.stringify(detailStateRef.current.draft)) return;
    setSnapshot(snap);
    setDraft({
      title: snap.title,
      description: snap.description ?? '',
      dueDate: snap.dueDate ?? '',
      labelIds: [...snap.labelIds]
    });
    setDetailTaskId(taskId);
    setMoveColumnId(snap.columnId);
    setMovePosition(0);
  };
  const saveDetail = async (): Promise<void> => {
    if (!detailTaskId || !snapshot || savingDetail) return;
    setSavingDetail(true);
    const request = detailRequestRef.current;
    try {
      const result = await guard(() =>
        board.actions.saveTaskDraft(detailTaskId, snapshot, {
          title: draft.title,
          description: draft.description,
          dueDate: draft.dueDate === '' ? null : draft.dueDate,
          labelIds: draft.labelIds
        })
      );
      // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
      if (result === undefined || request !== detailRequestRef.current || snapshot !== detailStateRef.current.snapshot)
        return;
      invalidateDetailRequest();
      setDetailTaskId(null);
      setSnapshot(null);
    } finally {
      setSavingDetail(false);
    }
  };

  /** 详情草稿相对快照是否有未保存修改（US-539「详情」行：关闭 / 切板先确认放弃）。 */
  const isDetailDirty = (): boolean =>
    snapshot !== null &&
    (draft.title !== snapshot.title ||
      draft.description !== (snapshot.description ?? '') ||
      draft.dueDate !== (snapshot.dueDate ?? '') ||
      [...draft.labelIds].sort().join(',') !== [...snapshot.labelIds].sort().join(','));

  /** 关闭详情：有未保存修改先确认放弃（取消零写）。 */
  const closeDetail = (): void => {
    if (isDetailDirty() && !window.confirm('有未保存的修改，关闭将放弃。继续？')) return;
    invalidateDetailRequest();
    setDetailTaskId(null);
    setSnapshot(null);
    setDetailActionsOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isEditing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === '/' && !isEditing) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      if (detailActionsOpen) {
        setDetailActionsOpen(false);
        return;
      }
      if (searchQuery.trim() !== '') {
        setSearchQuery('');
        setFilterLabelText('');
        setFilterLabelId('');
        setDueFilter('all');
        destroySearch();
        setFilterSuggestionsOpen(false);
        return;
      }
      if (openColumnMenuId !== null || viewOptionsOpen || filterSuggestionsOpen) {
        setOpenColumnMenuId(null);
        setViewOptionsOpen(false);
        setFilterSuggestionsOpen(false);
        return;
      }
      if (showFilters) {
        setShowFilters(false);
        return;
      }
      if (detailTaskId !== null) closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    detailActionsOpen,
    detailTaskId,
    filterSuggestionsOpen,
    openColumnMenuId,
    searchQuery,
    showFilters,
    viewOptionsOpen
  ]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('[data-board-menu]')) return;
      setOpenColumnMenuId(null);
      setViewOptionsOpen(false);
      setFilterSuggestionsOpen(false);
      setDetailActionsOpen(false);
    };
    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  // ---------- 菜单式移动（US-539 AC#6 键盘等价路径：移动到列 + 位置） ----------

  const [moveColumnId, setMoveColumnId] = useState<UUID | null>(null);
  const [movePosition, setMovePosition] = useState(0);
  const movePositionTasks =
    moveColumnId === null ? [] : (taskMap.get(moveColumnId) ?? []).filter(task => task.id !== detailTaskId);

  const moveTaskByMenu = async (): Promise<void> => {
    if (detailTaskId === null || moveColumnId === null) return;
    const target = resolveMenuMove(
      board.columns.map(column => ({
        columnId: column.id,
        taskIds: (taskMap.get(column.id) ?? []).map(task => task.id)
      })),
      detailTaskId,
      moveColumnId,
      movePosition
    );
    if (target === null) {
      setNotice('任务已在该位置');
      return;
    }
    // moveTask 返回 void：guard 的成功与失败都表现为 undefined，直接调用以区分成败
    const movedId = detailTaskId;
    try {
      await moveTaskAndSyncDetail(movedId, target);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      scheduleNoticeClear();
      return;
    }
    // 成功后焦点落在被移动对象（AC#6）：跨列 DOM 移动会丢焦点，固定时长内每帧重试
    const focusMovedCard = (taskId: UUID, attempts = 60): void => {
      const card = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
      if (card !== null && card.isConnected) card.focus();
      if (attempts > 0) requestAnimationFrame(() => focusMovedCard(taskId, attempts - 1));
    };
    focusMovedCard(movedId);
  };

  const moveColumnBy = async (columnId: UUID, direction: -1 | 1): Promise<void> => {
    const ids = board.columns.map(column => column.id);
    const index = ids.indexOf(columnId);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    const target =
      direction < 0 ?
        { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
      : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
    await guard(() => board.actions.moveColumn(columnId, target));
  };

  const detailTask = detailTaskId ? board.tasks.find(task => task.id === detailTaskId) : undefined;

  const confirmTaskDelete = async (task: Task): Promise<void> => {
    const plan = await board.actions.planTaskDelete(task.id);
    setConfirm(plan);
  };
  const confirmColumnDelete = async (column: Column): Promise<void> => {
    const plan = await board.actions.planColumnDelete(column.id);
    setConfirm(plan);
  };
  const confirmBoardDelete = async (): Promise<void> => {
    if (!current) return;
    const plan = await board.actions.planBoardDelete(current.id);
    setConfirm(plan);
  };
  const executeConfirmedDelete = async (): Promise<void> => {
    if (!confirm) return;
    setConfirm(null);
    const deleted = await guard(async () => {
      await board.actions.executeDelete(confirm);
      return true;
    });
    if (!deleted) return;
    const removedIds = confirm.kind === 'task' ? [confirm.taskId] : confirm.taskIds;
    const pendingId = pendingDetailRef.current;
    if (pendingId !== null && removedIds.includes(pendingId)) invalidateDetailRequest();
    const taskId = detailStateRef.current.taskId;
    if (taskId !== null && removedIds.includes(taskId)) {
      setDetailTaskId(null);
      setSnapshot(null);
    }
    if (confirm.kind === 'board') onSearchInput('');
  };

  const dueDateText = (task: Task): string => {
    const due = task.dueDate;
    if (!due) return '';
    return (
      due < today ? `已逾期 ${due}`
      : due === today ? `今天到期 ${due}`
      : due
    );
  };

  const labelsOf = (taskId: UUID): readonly BoardLabel[] => board.taskLabels.get(taskId) ?? [];

  const onSelectBoard = (boardId: UUID): void => {
    // 切板前关详情：有未保存修改先确认放弃（取消则留在原板，受控选择器自动回弹）
    if (detailTaskId !== null) {
      if (isDetailDirty() && !window.confirm('切板将放弃未保存的修改。继续？')) return;
      setDetailTaskId(null);
      setSnapshot(null);
    }
    invalidateDetailRequest();
    board.selectBoard(boardId);
    setFilterLabelId('');
    setFilterLabelText('');
    setDueFilter('all');
    setShowEmptyColumns(true);
    // 切板丢弃旧板结果：销毁重建句柄重发（setQuery 同词会被 distinctUntilChanged 吞掉）
    const query = searchQuery.trim();
    if (query !== '') {
      destroySearch();
      onSearchInput(query);
    }
  };

  const clearFilters = (): void => {
    setFilterLabelId('');
    setFilterLabelText('');
    setDueFilter('all');
    setSearchQuery('');
    destroySearch();
  };

  const boardSelector = (
    <select
      className='board-selector'
      value={board.currentBoardId ?? ''}
      onChange={event => onSelectBoard(event.target.value as UUID)}
      data-testid='board-selector'
      aria-label='选择看板'
    >
      {board.boards.map(item => (
        <option key={item.id} value={item.id}>
          {item.title}
        </option>
      ))}
    </select>
  );

  const current = board.currentBoard;

  return (
    <section
      className='board-view'
      data-testid='board-view'
      onDragOver={event => event.preventDefault()}
      onDragEnd={clearDragFeedback}
      onDrop={event => void onColumnDrop(event)}
    >
      <header className='board-header' data-testid='board-header'>
        <div className='board-heading'>
          <div className='board-eyebrow'>LOCAL PROJECT / 看板</div>
          <div className='board-title-row'>
            {boardSelector}
            {current && editingBoard ?
              <form
                className='inline-editor board-title-editor'
                onSubmit={event => {
                  event.preventDefault();
                  void commitBoardEdit();
                }}
              >
                <input
                  value={editingBoardValue}
                  onChange={event => setEditingBoardValue(event.target.value)}
                  autoFocus
                  aria-label='看板标题'
                  data-testid='board-title-editor'
                />
                <button type='submit' data-testid='board-title-save'>
                  保存
                </button>
                <button type='button' onClick={() => setEditingBoard(false)} data-testid='board-title-cancel'>
                  取消
                </button>
              </form>
            : current ?
              <button
                className='header-button'
                onClick={startBoardEdit}
                data-testid='rename-board'
                aria-label='改板标题'
              >
                {current.title}
              </button>
            : null}
            {board.restoring ?
              <span className='restoring-badge' data-testid='restoring-badge' aria-live='polite'>
                恢复中
              </span>
            : null}
          </div>
          {current ?
            <p className='board-description'>
              任务按状态推进，拖动卡片即可重新排序或切换列。数据保存在本地，可随时导出备份。
            </p>
          : null}
        </div>
        <div className='header-actions'>
          <div className='header-action-group' aria-label='历史操作'>
            <button
              className='icon-button'
              onClick={() => void guard(() => board.actions.undo())}
              data-testid='undo'
              disabled={board.restoring || board.undoCount === 0}
              aria-label='撤销'
              title='撤销'
            >
              ↶
            </button>
            <button
              className='icon-button'
              onClick={() => void guard(() => board.actions.redo())}
              data-testid='redo'
              disabled={board.restoring || board.redoCount === 0}
              aria-label='重做'
              title='重做'
            >
              ↷
            </button>
          </div>
          <button
            className='header-secondary-action'
            onClick={() => {
              if (onExportBackup) void onExportBackup();
              else setNotice('备份导出由宿主接线（US-537）');
            }}
            data-testid='export-backup'
            disabled={board.restoring}
          >
            导出备份
          </button>
          <button
            className='header-primary-action'
            onClick={() => startComposer('column')}
            data-testid='create-column'
            disabled={board.restoring || !current || composerSaving}
          >
            <span aria-hidden='true'>＋</span> 新建列
          </button>
          <button
            className='header-create-board'
            onClick={() => startComposer('board')}
            data-testid='create-board'
            disabled={board.restoring || composerSaving}
          >
            新建板
          </button>
          <button
            className='header-danger-action'
            onClick={() => void confirmBoardDelete()}
            data-testid='delete-board'
            disabled={board.restoring || !current}
          >
            删除看板
          </button>
          <button
            className='header-utility-action'
            onClick={() => startComposer('label')}
            data-testid='create-label'
            disabled={board.restoring || !current || composerSaving}
          >
            标签
          </button>
        </div>
        {composer !== null && current ?
          <form
            className='composer-popover'
            data-board-menu='composer'
            data-testid={`${composer}-composer`}
            onSubmit={event => {
              event.preventDefault();
              void submitComposer();
            }}
          >
            <strong>
              {composer === 'board' ?
                '新建看板'
              : composer === 'column' ?
                '新建列'
              : '新建标签'}
            </strong>
            <input
              value={composerValue}
              onChange={event => setComposerValue(event.target.value)}
              autoFocus
              placeholder={composer === 'label' ? '标签名称' : '输入名称'}
              aria-label={
                composer === 'board' ? '新看板名称'
                : composer === 'column' ?
                  '新列名称'
                : '新标签名称'
              }
              data-testid={`${composer}-composer-input`}
              disabled={composerSaving}
            />
            {composer === 'label' ?
              <input
                type='text'
                value={composerColor}
                onChange={event => setComposerColor(event.target.value)}
                aria-label='标签颜色'
                data-testid='label-composer-color'
                disabled={composerSaving}
              />
            : null}
            <div className='composer-actions'>
              <button
                type='submit'
                className='composer-submit'
                data-testid={`${composer}-composer-submit`}
                disabled={composerSaving || composerValue.trim() === ''}
              >
                {composerSaving ? '保存中…' : '创建'}
              </button>
              <button
                type='button'
                onClick={cancelComposer}
                data-testid={`${composer}-composer-cancel`}
                disabled={composerSaving}
              >
                取消
              </button>
            </div>
          </form>
        : null}
      </header>

      {current ?
        <div className='board-summary' data-testid='board-summary'>
          <span className='summary-item'>
            <strong>{board.tasks.length}</strong> 个任务
          </span>
          <span className='summary-divider' aria-hidden='true' />
          <span className='summary-item'>
            <strong>{board.columns.length}</strong> 个状态
          </span>
          <span className='summary-divider' aria-hidden='true' />
          <span className={`summary-item${overdueTaskCount > 0 ? 'summary-warning' : ''}`}>
            <strong>{overdueTaskCount}</strong> 个逾期
          </span>
          {activeFilterCount > 0 ?
            <span className='summary-filter-state'>
              已筛选 {visibleTasks.length} / {board.tasks.length}
            </span>
          : null}
        </div>
      : null}

      {!current ?
        <div className='empty-board' data-testid='empty-board'>
          <p>没有看板</p>
          <button onClick={() => startComposer('board')} data-testid='create-board-empty' disabled={board.restoring}>
            新建板
          </button>
          {composer === 'board' ?
            <form
              className='empty-composer'
              onSubmit={event => {
                event.preventDefault();
                void submitComposer();
              }}
            >
              <input
                value={composerValue}
                onChange={event => setComposerValue(event.target.value)}
                autoFocus
                aria-label='新看板名称'
                data-testid='board-composer-input'
              />
              <button type='submit' data-testid='board-composer-submit' disabled={composerValue.trim() === ''}>
                创建
              </button>
              <button type='button' onClick={cancelComposer}>
                取消
              </button>
            </form>
          : null}
        </div>
      : null}

      {board.restoring ?
        <p className='restoring-note' data-testid='restoring-note'>
          恢复进行中：浏览可用，写入口已暂停。
        </p>
      : null}

      {current && board.labels.length > 0 ?
        <div className='label-strip' data-testid='label-strip'>
          {board.labels.map(label => (
            <span
              key={label.id}
              className='label-chip'
              style={{ background: label.color, color: labelTextColor(label.color) }}
              data-testid='label-chip'
            >
              <button className='label-name' onClick={() => startLabelEdit(label)} aria-label='改名'>
                {editingLabelId === label.id ?
                  <input
                    value={editingLabelValue}
                    onChange={event => setEditingLabelValue(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') void commitLabelEdit(label);
                      if (event.key === 'Escape') setEditingLabelId(null);
                    }}
                    onClick={event => event.stopPropagation()}
                    autoFocus
                    aria-label={`标签名称 ${label.name}`}
                  />
                : label.name}
              </button>
              <button
                className='label-delete'
                onClick={() => {
                  void (async () => {
                    const plan = await board.actions.planLabelDelete(label.id);
                    if (
                      window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`)
                    ) {
                      await guard(() => board.actions.executeLabelDelete(plan));
                    }
                  })();
                }}
                aria-label={`删除标签 ${label.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      : null}

      {notice ?
        <p className='board-notice' role='alert' data-testid='board-notice'>
          {notice}
          <button onClick={() => setNotice(null)} data-testid='board-notice-close' aria-label='关闭提示'>
            ×
          </button>
        </p>
      : null}

      {current ?
        <div className='board-toolbar' data-testid='board-toolbar'>
          <div className='view-switcher' role='tablist' aria-label='看板视图'>
            <button className='view-tab view-tab-active' role='tab' aria-selected='true' data-testid='board-view-tab'>
              <span aria-hidden='true'>▦</span> 看板
            </button>
            <span className='view-tab-note'>本地视图</span>
          </div>
          <div className='toolbar-actions'>
            <div className='board-search filter-combobox' data-testid='board-search' data-board-menu='filter'>
              <span className='search-icon' aria-hidden='true'>
                ⌕
              </span>
              <input
                ref={searchInputRef}
                className='search-input'
                value={searchQuery}
                onChange={event => onSearchInput(event.target.value)}
                onFocus={() => setFilterSuggestionsOpen(true)}
                placeholder='按关键词或字段筛选'
                aria-label='Filter'
                data-testid='board-search-input'
              />
              <kbd>/</kbd>
              {searchQuery !== '' ?
                <button
                  className='search-clear'
                  onClick={() => onSearchInput('')}
                  aria-label='清除搜索'
                  data-testid='board-search-clear'
                >
                  ×
                </button>
              : null}
              {filterSuggestionsOpen && searchQuery.trim() === '' ?
                <div className='filter-suggestions' role='listbox' aria-label='筛选建议'>
                  <span className='filter-suggestions-heading'>支持的筛选</span>
                  <button
                    type='button'
                    onClick={() => {
                      onSearchInput('label:');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <strong>label:</strong>
                    <span>按标签筛选</span>
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      onSearchInput('due:overdue');
                      setFilterSuggestionsOpen(false);
                    }}
                  >
                    <strong>due:overdue</strong>
                    <span>只显示逾期任务</span>
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      onSearchInput('due:today');
                      setFilterSuggestionsOpen(false);
                    }}
                  >
                    <strong>due:today</strong>
                    <span>只显示今天到期</span>
                  </button>
                </div>
              : null}
              {board.searchSource && parseFilter(searchQuery).text !== '' ?
                <div className='search-results' data-testid='board-search-results'>
                  {searchState === 'loading' ?
                    <p className='search-state' data-testid='board-search-loading'>
                      搜索中…
                    </p>
                  : searchState === 'error' ?
                    <p className='search-state' data-testid='board-search-error'>
                      {searchErrorText}
                    </p>
                  : searchState === 'empty' ?
                    <p className='search-state' data-testid='board-search-empty'>
                      无匹配
                    </p>
                  : <>
                      {searchResults.map(result => (
                        <button
                          key={result.id}
                          className='search-result'
                          onClick={() => onSearchResultClick(result)}
                          data-testid='board-search-result'
                        >
                          <span className='search-result-title'>
                            {board.tasks.find(task => task.id === (result.id as UUID))?.title ?? ''}
                          </span>
                          <span className='search-result-column'>
                            {board.columns.find(column => {
                              const task = board.tasks.find(candidate => candidate.id === (result.id as UUID));
                              return task ? column.id === task.columnId : false;
                            })?.title ?? ''}
                          </span>
                          <span className='search-result-snippet'>{result.snippet}</span>
                        </button>
                      ))}
                      {searchHasMore ?
                        <button
                          className='search-more'
                          onClick={() => void searchHandleRef.current?.loadMore()}
                          data-testid='board-search-more'
                        >
                          加载更多
                        </button>
                      : null}
                    </>
                  }
                </div>
              : null}
            </div>

            <button
              className={`filter-toggle${showFilters || activeFilterCount > 0 ? 'filter-toggle-active' : ''}`}
              onClick={() => setShowFilters(value => !value)}
              aria-expanded={showFilters}
              aria-controls='board-filter-panel'
              data-testid='board-filter-toggle'
            >
              <span aria-hidden='true'>☷</span> 筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
            <button
              className={`empty-columns-toggle${showEmptyColumns ? '' : 'empty-columns-toggle-active'}`}
              onClick={() => setShowEmptyColumns(value => !value)}
              aria-pressed={!showEmptyColumns}
              data-testid='toggle-empty-columns'
            >
              {showEmptyColumns ? '隐藏空列' : '显示空列'}
            </button>
            <div className='view-options' data-board-menu='view'>
              <button
                className={viewOptionsOpen ? 'view-options-toggle view-options-toggle-active' : 'view-options-toggle'}
                onClick={() => setViewOptionsOpen(value => !value)}
                aria-expanded={viewOptionsOpen}
                data-testid='view-options'
              >
                视图 <span aria-hidden='true'>⌄</span>
              </button>
              <div className='view-options-menu' role='menu' hidden={!viewOptionsOpen}>
                <span className='menu-heading'>布局</span>
                <button role='menuitemradio' aria-checked='true' className='menu-check'>
                  看板
                </button>
                <span className='menu-heading'>字段</span>
                <button
                  role='menuitemcheckbox'
                  aria-checked={showDescriptions}
                  onClick={() => setShowDescriptions(value => !value)}
                >
                  <span>{showDescriptions ? '✓' : ''}</span> 描述
                </button>
                <button
                  role='menuitemcheckbox'
                  aria-checked={showLabels}
                  onClick={() => setShowLabels(value => !value)}
                >
                  <span>{showLabels ? '✓' : ''}</span> 标签
                </button>
                <button
                  role='menuitemcheckbox'
                  aria-checked={!showEmptyColumns}
                  onClick={() => setShowEmptyColumns(value => !value)}
                >
                  <span>{showEmptyColumns ? '' : '✓'}</span> 隐藏空列
                </button>
              </div>
            </div>
          </div>
        </div>
      : null}

      {current && showFilters ?
        <div className='filter-panel' id='board-filter-panel' data-testid='board-filter-panel'>
          <div className='filter-panel-heading'>
            <div>
              <strong>筛选任务</strong>
              <span> 只影响当前视图，不会修改数据</span>
            </div>
            <button
              className='filter-clear'
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              data-testid='clear-board-filters'
            >
              清除筛选
            </button>
          </div>
          <label className='filter-control'>
            <span>标签</span>
            <select
              value={filterLabelId}
              onChange={event => {
                const id = event.target.value as UUID | '';
                setFilterLabelId(id);
                setFilterLabelText(board.labels.find(label => label.id === id)?.name ?? '');
              }}
              aria-label='按标签筛选'
              data-testid='board-filter-label'
            >
              <option value=''>全部标签</option>
              {board.labels.map(label => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </label>
          <label className='filter-control'>
            <span>截止日期</span>
            <select
              value={dueFilter}
              onChange={event => setDueFilter(event.target.value as DueFilter)}
              aria-label='按截止日期筛选'
              data-testid='board-filter-due'
            >
              <option value='all'>全部任务</option>
              <option value='overdue'>已逾期</option>
              <option value='today'>今天到期</option>
              <option value='upcoming'>即将到期</option>
            </select>
          </label>
          <span className='filter-result-count'>当前显示 {visibleTasks.length} 个任务</span>
        </div>
      : null}

      {current ?
        <div className='columns' data-testid='columns'>
          {visibleColumns.map(column => (
            <section
              key={column.id}
              className={
                dropTarget?.kind === 'task-end' && dropTarget.columnId === column.id ? 'column drop-end' : 'column'
              }
              data-column-id={column.id}
              onDragOver={event => onTaskDragOver(event)}
              onDrop={event => void onTaskDrop(event)}
              data-testid='column'
            >
              <header
                className={[
                  'column-header',
                  dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'before' ?
                    'drop-before'
                  : '',
                  dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'after' ?
                    'drop-after'
                  : '',
                  dragging?.kind === 'column' && dragging.id === column.id ? 'dragging' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-column-header-id={column.id}
                draggable
                onDragOver={event => onColumnDragOver(event)}
                onDragStart={event => onColumnDragStart(event, column)}
                data-testid='column-header'
              >
                <div className='column-heading'>
                  {editingColumnId === column.id ?
                    <form
                      className='inline-editor column-title-editor'
                      onSubmit={event => {
                        event.preventDefault();
                        void commitColumnEdit(column);
                      }}
                    >
                      <input
                        value={editingColumnValue}
                        onChange={event => setEditingColumnValue(event.target.value)}
                        autoFocus
                        aria-label={`列标题 ${column.title}`}
                        data-testid='column-title-editor'
                      />
                      <button type='submit' data-testid='column-title-save'>
                        保存
                      </button>
                      <button type='button' onClick={() => setEditingColumnId(null)} data-testid='column-title-cancel'>
                        取消
                      </button>
                    </form>
                  : <h2 className='column-title' data-testid='column-title'>
                      {column.title}
                    </h2>
                  }
                  <span className='column-count' data-testid='column-count'>
                    {(visibleTaskMap.get(column.id) ?? []).length}
                    {(
                      activeFilterCount > 0 &&
                      (taskMap.get(column.id) ?? []).length !== (visibleTaskMap.get(column.id) ?? []).length
                    ) ?
                      <span className='column-total-count'> / {(taskMap.get(column.id) ?? []).length}</span>
                    : null}
                  </span>
                </div>
                <div className='column-menu' data-board-menu='column'>
                  <button
                    className='column-menu-trigger'
                    onClick={event => {
                      event.stopPropagation();
                      setOpenColumnMenuId(value => (value === column.id ? null : column.id));
                    }}
                    aria-label={`列操作：${column.title}`}
                    aria-expanded={openColumnMenuId === column.id}
                    data-testid='column-actions'
                  >
                    <span aria-hidden='true'>•••</span>
                  </button>
                  <div className='column-menu-panel' role='menu' hidden={openColumnMenuId !== column.id}>
                    <span className='menu-heading'>列</span>
                    <button
                      role='menuitem'
                      onClick={() => startColumnEdit(column)}
                      data-testid='column-rename'
                      aria-label='改列名'
                    >
                      编辑列名
                    </button>
                    <button
                      role='menuitem'
                      onClick={() => void moveColumnBy(column.id, -1)}
                      data-testid='column-move-back'
                      aria-label='前移'
                    >
                      前移
                    </button>
                    <button
                      role='menuitem'
                      onClick={() => void moveColumnBy(column.id, 1)}
                      data-testid='column-move-forward'
                      aria-label='后移'
                    >
                      后移
                    </button>
                    <button
                      role='menuitem'
                      onClick={() => void sortColumnBy(column.id, 'dueDate')}
                      data-testid='column-sort-due'
                      aria-label='按截止日排序'
                      disabled={sortingColumnId === column.id}
                    >
                      按截止日
                    </button>
                    <button
                      role='menuitem'
                      onClick={() => void sortColumnBy(column.id, 'title')}
                      data-testid='column-sort-title'
                      aria-label='按标题排序'
                      disabled={sortingColumnId === column.id}
                    >
                      按标题
                    </button>
                    <button
                      role='menuitem'
                      onClick={() => void confirmColumnDelete(column)}
                      data-testid='column-delete'
                      aria-label='删除列'
                    >
                      删除
                    </button>
                  </div>
                </div>
              </header>
              <div className='cards'>
                {(visibleTaskMap.get(column.id) ?? []).map(task => (
                  <article
                    key={task.id}
                    className={[
                      'card',
                      searchHighlightId === task.id ? 'search-hit' : '',
                      dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'before' ?
                        'drop-before'
                      : '',
                      dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'after' ?
                        'drop-after'
                      : '',
                      dragging?.kind === 'task' && dragging.id === task.id ? 'dragging' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-task-id={task.id}
                    tabIndex={0}
                    draggable
                    onDragStart={event => onTaskDragStart(event, task)}
                    onClick={event => {
                      if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select'))
                        return;
                      setExpandedTaskId(value => (value === task.id ? null : task.id));
                    }}
                    onKeyDown={event => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setExpandedTaskId(value => (value === task.id ? null : task.id));
                      }
                    }}
                    aria-expanded={expandedTaskId === task.id}
                    data-testid='task-card'
                  >
                    {editTitleTaskId === task.id ?
                      <>
                        <input
                          className='title-editor'
                          value={editTitleValue}
                          onChange={event => setEditTitleValue(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void commitEditTitle(task);
                            if (event.key === 'Escape') setEditTitleTaskId(null);
                          }}
                          data-testid='task-title-editor'
                          aria-label='任务标题'
                        />
                        <button
                          onClick={() => void commitEditTitle(task)}
                          data-testid='task-title-save'
                          aria-label='保存标题'
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setEditTitleTaskId(null)}
                          data-testid='task-title-cancel'
                          aria-label='取消'
                        >
                          取消
                        </button>
                      </>
                    : <>
                        <div className='card-topline'>
                          <button
                            className='card-title'
                            onClick={() => void openDetail(task.id)}
                            data-testid='task-title'
                          >
                            {task.title}
                          </button>
                          <button
                            className='card-edit'
                            onClick={() => startEditTitle(task)}
                            data-testid='task-edit-title'
                            aria-label='编辑标题'
                            title='快速编辑标题'
                          >
                            <span aria-hidden='true'>✎</span>
                            <span className='sr-only'>编辑</span>
                          </button>
                        </div>
                        {showDescriptions && task.description ?
                          <p className='card-description' data-testid='task-description-preview'>
                            {task.description}
                          </p>
                        : null}
                      </>
                    }
                    {showLabels && (labelsOf(task.id).length > 0 || dueDateText(task)) ?
                      <div className='card-meta'>
                        {labelsOf(task.id).length > 0 ?
                          <div className='card-labels'>
                            {labelsOf(task.id).map(label => (
                              <span
                                key={label.id}
                                className='card-label'
                                style={{ background: label.color, color: labelTextColor(label.color) }}
                                data-testid='card-label'
                                aria-label={label.name}
                              >
                                {label.name}
                              </span>
                            ))}
                          </div>
                        : null}
                        {dueDateText(task) ?
                          <span
                            className={`card-due${dueState(task, today) === 'overdue' ? 'overdue' : ''}`}
                            data-testid='task-due'
                          >
                            {dueDateText(task)}
                          </span>
                        : null}
                      </div>
                    : null}
                    {expandedTaskId === task.id ?
                      <div className='card-expanded-fields' data-testid='task-expanded-fields'>
                        <div className='card-field'>
                          <span>状态</span>
                          <strong>{column.title}</strong>
                        </div>
                        <div className='card-field'>
                          <span>截止日期</span>
                          <strong>{task.dueDate ?? '未设置'}</strong>
                        </div>
                        <button
                          className='card-open-detail'
                          onClick={() => void openDetail(task.id)}
                          data-testid='task-open-detail'
                        >
                          打开详情
                        </button>
                      </div>
                    : null}
                  </article>
                ))}
                <button
                  className='add-task'
                  onClick={() => {
                    if (creatingTaskRef.current) return;
                    setAddTaskColumnId(column.id);
                    setAddTaskTitle('');
                  }}
                  disabled={board.restoring || creatingTask}
                  data-testid='add-task'
                >
                  + 添加任务
                </button>
                {addTaskColumnId === column.id ?
                  <div className='add-task-form' data-testid='add-task-form'>
                    <input
                      className='add-task-input'
                      value={addTaskTitle}
                      onChange={event => setAddTaskTitle(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void commitAddTask();
                        if (event.key === 'Escape') cancelAddTask();
                      }}
                      placeholder='输入任务标题'
                      aria-label='新任务标题'
                      data-testid='add-task-input'
                      disabled={creatingTask}
                    />
                    <button
                      className='add-task-submit'
                      onClick={() => void commitAddTask()}
                      disabled={creatingTask || addTaskTitle.trim() === ''}
                      data-testid='add-task-submit'
                    >
                      添加
                    </button>
                    <button
                      className='add-task-cancel'
                      onClick={cancelAddTask}
                      aria-label='取消'
                      data-testid='add-task-cancel'
                      disabled={creatingTask}
                    >
                      ×
                    </button>
                  </div>
                : null}
              </div>
            </section>
          ))}
          <button
            className='add-column'
            onClick={() => startComposer('column')}
            disabled={board.restoring}
            data-testid='add-column'
          >
            <span aria-hidden='true'>＋</span> 添加列
          </button>
        </div>
      : null}

      {current && detailTaskId ?
        <>
          {!detailPinned ?
            <button
              className='panel-backdrop'
              onClick={closeDetail}
              aria-label='关闭任务详情'
              data-testid='detail-backdrop'
            />
          : null}
          <aside
            className={`detail-panel${detailPinned ? 'detail-panel-pinned' : ''}`}
            role='dialog'
            aria-modal={detailPinned ? undefined : 'true'}
            aria-label={`任务详情：${draft.title}`}
            aria-labelledby='detail-panel-title'
            data-testid='detail-panel'
          >
            <div className='detail-header'>
              <div className='detail-heading'>
                <span className='panel-kicker'>TASK DETAILS</span>
                <h3 id='detail-panel-title'>{draft.title || '任务详情'}</h3>
              </div>
              <div className='detail-header-actions' data-board-menu='detail'>
                <button
                  className='detail-icon-button'
                  onClick={() => setDetailPinned(value => !value)}
                  aria-label={detailPinned ? '取消固定侧栏' : '固定侧栏'}
                  aria-pressed={detailPinned}
                  data-testid='detail-pin'
                >
                  {detailPinned ? '▣' : '□'}
                </button>
                <button
                  className='detail-icon-button'
                  onClick={() => setDetailActionsOpen(value => !value)}
                  aria-label='任务操作'
                  aria-expanded={detailActionsOpen}
                  data-testid='detail-actions-toggle'
                >
                  •••
                </button>
                <button
                  className='panel-close'
                  onClick={closeDetail}
                  aria-label='关闭任务详情'
                  data-testid='detail-close'
                >
                  ×
                </button>
                <div className='detail-actions-menu' role='menu' hidden={!detailActionsOpen}>
                  <button
                    role='menuitem'
                    onClick={() => {
                      if (detailTask) void confirmTaskDelete(detailTask);
                      setDetailActionsOpen(false);
                    }}
                    data-testid='detail-delete'
                  >
                    删除任务
                  </button>
                </div>
              </div>
            </div>
            <label>
              标题
              <input
                value={draft.title}
                onChange={event => setDraft({ ...draft, title: event.target.value })}
                data-testid='detail-title'
                disabled={savingDetail}
              />
            </label>
            <label>
              描述
              <textarea
                value={draft.description}
                onChange={event => setDraft({ ...draft, description: event.target.value })}
                data-testid='detail-description'
                disabled={savingDetail}
              />
            </label>
            <label>
              截止日（YYYY-MM-DD）
              <input
                value={draft.dueDate}
                onChange={event => setDraft({ ...draft, dueDate: event.target.value })}
                placeholder='YYYY-MM-DD'
                data-testid='detail-due'
                disabled={savingDetail}
              />
            </label>
            <fieldset>
              <legend>标签</legend>
              {board.labels.map(label => (
                <label key={label.id} className='detail-label'>
                  <input
                    type='checkbox'
                    checked={draft.labelIds.includes(label.id)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        labelIds:
                          draft.labelIds.includes(label.id) ?
                            draft.labelIds.filter(id => id !== label.id)
                          : [...draft.labelIds, label.id]
                      })
                    }
                    data-testid='detail-label-check'
                    disabled={savingDetail}
                  />
                  <span style={{ background: label.color, color: labelTextColor(label.color) }}>{label.name}</span>
                </label>
              ))}
            </fieldset>
            <div className='detail-move' data-testid='detail-move'>
              <label>
                移动到
                <select
                  value={moveColumnId ?? ''}
                  onChange={event => {
                    setMoveColumnId(event.target.value as UUID);
                    setMovePosition(0);
                  }}
                  data-testid='move-column'
                  disabled={savingDetail}
                  aria-label='移动到列'
                >
                  {board.columns.map(column => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                位置
                <select
                  value={movePosition}
                  onChange={event => setMovePosition(Number(event.target.value))}
                  data-testid='move-position'
                  disabled={savingDetail}
                  aria-label='位置'
                >
                  <option value={0}>列首</option>
                  {movePositionTasks.map((task, index) => (
                    <option key={task.id} value={index + 1}>
                      在「{task.title}」之后
                    </option>
                  ))}
                  <option value={movePositionTasks.length}>列尾</option>
                </select>
              </label>
              <button onClick={() => void moveTaskByMenu()} data-testid='move-task' disabled={savingDetail}>
                移动
              </button>
            </div>
            <div className='detail-actions'>
              <button
                className='detail-save'
                onClick={() => void saveDetail()}
                data-testid='detail-save'
                disabled={savingDetail}
              >
                {savingDetail ? '保存中…' : '保存修改'}
              </button>
              <button className='detail-cancel' onClick={closeDetail} data-testid='detail-cancel'>
                关闭
              </button>
            </div>
          </aside>
        </>
      : null}

      {confirm ?
        <>
          <div className='panel-backdrop' aria-hidden='true' />
          <aside className='confirm-panel' role='alertdialog' aria-modal='true' data-testid='confirm-delete'>
            {confirm.kind === 'task' ?
              <p>删除任务「{confirm.taskTitle}」？</p>
            : confirm.kind === 'column' ?
              <p>
                删除列「{confirm.columnTitle}」及其 {confirm.taskIds.length} 个任务？
              </p>
            : <p>
                删除看板「{confirm.boardTitle}」（{confirm.columnIds.length} 列、{confirm.taskIds.length}{' '}
                任务、含全部标签定义与关联）？
              </p>
            }
            <div className='confirm-actions'>
              <button onClick={() => void executeConfirmedDelete()} data-testid='confirm-delete-yes'>
                确认删除
              </button>
              <button onClick={() => setConfirm(null)} data-testid='confirm-delete-no'>
                取消
              </button>
            </div>
          </aside>
        </>
      : null}
    </section>
  );
}
