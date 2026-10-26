<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue';
import type { UUID } from '@aiao/rxdb';
import {
  labelTextColor,
  RESTORING_MARKER_KEY,
  resolveCardDrop,
  resolveColumnDrop,
  resolveMenuMove,
  type BoardLabel,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream,
  type CardDropColumnView,
  type CardDropTarget,
  type DeletePlan,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { Subscription } from 'rxjs';

import { useBoard } from './use-board.js';

/**
 * 看板视图组件（US-539 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
 * 标签管理 + 撤销重做 + 备份入口占位 + 删除确认。
 *
 * 三端只采集指针事件，落点换算调用核心包同一份 `resolveCardDrop` /
 * `resolveColumnDrop`；全部写入口经 {@link useBoard} 的领域动作。
 * 与 Angular / React 同功能同领域 API（交互约定见 US-539）。
 */
const props = defineProps<{
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  onExportBackup?: () => void | Promise<void>;
}>();

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = ref(dateKey(new Date()));
let todayTimer: number | null = null;
const refreshToday = (): void => {
  today.value = dateKey(new Date());
  if (todayTimer !== null) window.clearTimeout(todayTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  todayTimer = window.setTimeout(refreshToday, Math.max(nextMidnight - now.getTime() + 1, 1000));
};
const searchUnavailableText = (reason: BoardSearchUnavailableReason | null): string =>
  reason === 'plugin_not_installed' ? '搜索插件未安装'
  : reason === 'adapter_unsupported' ? '当前适配器不支持搜索'
  : reason === 'query_failed' ? '搜索查询失败'
  : '';

// Vue 会把 props 包成 reactive 代理：类实例（EntityManager 等）经代理调用
// 会丢私有成员与原型链，必须取回原始对象（Vue 官方 toRaw 语义）
const installedSearch = toRaw(props.rxdb).getPlugins('search')[0] as
  | { readonly searchCollection?: unknown }
  | undefined;
const searchUpstream =
  installedSearch && typeof installedSearch.searchCollection === 'function' ? installedSearch : undefined;
const searchUnavailableReason: BoardSearchUnavailableReason | undefined =
  installedSearch === undefined ? 'plugin_not_installed' : searchUpstream === undefined ? 'adapter_unsupported' : undefined;
const board = useBoard(
  toRaw(props.rxdb),
  searchUpstream ?
    { search: { upstream: searchUpstream as BoardSearchUpstream } }
  : { searchUnavailableReason }
);

const editTitleTaskId = ref<UUID | null>(null);
const editTitleValue = ref('');

/** 写入口 busy 状态（US-539 交互约定「写入」行：执行中阻止重复提交）。 */
const savingDetail = ref(false);
const sortingColumnId = ref<UUID | null>(null);

/** 菜单式移动（US-539 AC#6 键盘等价路径）：目标列与插入下标。 */
const moveColumnId = ref<UUID | null>(null);
const movePosition = ref(0);

/** 目标列变更：位置重置到列首（模板事件用方法，不带 TS 强转与多语句表达式）。 */
const onMoveColumnChange = (event: Event): void => {
  moveColumnId.value = (event.target as HTMLSelectElement).value as UUID;
  movePosition.value = 0;
};

/** 位置变更。 */
const onMovePositionChange = (event: Event): void => {
  movePosition.value = Number((event.target as HTMLSelectElement).value);
};
let detailRequest = 0;
let pendingDetailTaskId: UUID | null = null;
const invalidateDetailRequest = (): void => {
  detailRequest++;
  pendingDetailTaskId = null;
};
const detailTaskId = ref<UUID | null>(null);
const draft = ref({ title: '', description: '', dueDate: '', labelIds: [] as readonly UUID[] });
const snapshot = ref<TaskDraftSnapshot | null>(null);
const confirm = ref<ConfirmState | null>(null);

// ---------- 板内搜索（US-539 阶段 B） ----------
const searchQuery = ref('');
const searchState = ref<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
const searchResults = ref<readonly SearchResult[]>([]);
const searchHasMore = ref(false);
const searchErrorText = ref<string | null>(null);
const searchHighlightId = ref<UUID | null>(null);
let searchHandle: SearchHandle | null = null;
let searchSubs: Subscription | null = null;
let highlightTimer: number | null = null;

const destroySearch = (): void => {
  searchSubs?.unsubscribe();
  searchSubs = null;
  searchHandle?.destroy();
  searchHandle = null;
  searchState.value = 'idle';
  searchResults.value = [];
  searchHasMore.value = false;
  searchErrorText.value = null;
};

const onSearchInputValue = (value: string): void => {
  searchQuery.value = value;
  const query = value.trim();
  if (query === '') {
    destroySearch();
    return;
  }
  const source = board.searchSource;
  if (!source) return;
  if (searchHandle === null) {
    const handle = source.search(query);
    searchHandle = handle;
    // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
    searchSubs?.unsubscribe();
    const subs = new Subscription();
    subs.add(handle.state$.subscribe(state => (searchState.value = state)));
    subs.add(handle.results$.subscribe(results => (searchResults.value = results)));
    subs.add(handle.hasMore$.subscribe(more => (searchHasMore.value = more)));
    subs.add(handle.error$.subscribe(error => (searchErrorText.value = String(error))));
    searchSubs = subs;
  } else {
    searchHandle.setQuery(query);
  }
};

const onSearchInput = (event: Event): void => {
  onSearchInputValue((event.target as HTMLInputElement).value);
};

const onSearchMore = (): void => {
  if (searchState.value === 'loading') return;
  void searchHandle?.loadMore();
};

/** 点结果：滚动到目标卡片并短暂高亮（更新中由「搜索中」状态接管，无结果可点）。 */
const onSearchResultClick = (result: SearchResult): void => {
  document.querySelector<HTMLElement>(`[data-task-id="${result.id}"]`)?.scrollIntoView({ block: 'center' });
  const targetId = result.id as UUID;
  searchHighlightId.value = targetId;
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    if (searchHighlightId.value === targetId) searchHighlightId.value = null;
  }, 2000);
};

const searchResultTitle = (result: SearchResult): string =>
  board.tasks.value.find(task => task.id === (result.id as UUID))?.title ?? '';
const searchResultColumn = (result: SearchResult): string => {
  const task = board.tasks.value.find(candidate => candidate.id === (result.id as UUID));
  return task ? (board.columns.value.find(column => column.id === task.columnId)?.title ?? '') : '';
};

onBeforeUnmount(() => {
  invalidateDetailRequest();
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  searchSubs?.unsubscribe();
  searchHandle?.destroy();
});
const notice = ref<string | null>(null);

const taskMap = computed(() => {
  const grouped = new Map<UUID, (typeof board.tasks.value)[number][]>();
  for (const column of board.columns.value) grouped.set(column.id, []);
  for (const task of board.tasks.value) {
    const list = grouped.get(task.columnId) ?? [];
    list.push(task);
    grouped.set(task.columnId, list);
  }
  return grouped;
});

let noticeTimer: number | null = null;
const scheduleNoticeClear = (): void => {
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), 5000);
};

const guard = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
  try {
    notice.value = null;
    return await operation();
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
    scheduleNoticeClear();
    return undefined;
  }
};

const promptTitle = (message: string, initial?: string): string | null => {
  const value = typeof window !== 'undefined' ? window.prompt(message, initial) : null;
  return value === null ? null : value;
};

const createBoard = async (): Promise<void> => {
  const title = promptTitle('新建看板：标题');
  if (title === null) return;
  await guard(() => board.actions.createBoard({ title }));
};
const createColumn = async (): Promise<void> => {
  const title = promptTitle('新建列：标题');
  if (title === null) return;
  await guard(() => board.actions.createColumn({ title }));
};
/** 内联建任务（GitHub Projects 同款：列底输入框，Enter 提交 / Esc 取消）。 */
const addTaskColumnId = ref<UUID | null>(null);
const addTaskTitle = ref('');
const creatingTask = ref(false);

const openAddTask = (columnId: UUID): void => {
  if (creatingTask.value) return;
  addTaskColumnId.value = columnId;
  addTaskTitle.value = '';
};

const cancelAddTask = (): void => {
  if (creatingTask.value) return;
  addTaskColumnId.value = null;
  addTaskTitle.value = '';
};

const commitAddTask = async (): Promise<void> => {
  if (creatingTask.value) return;
  const columnId = addTaskColumnId.value;
  const title = addTaskTitle.value.trim();
  if (columnId === null || title === '') {
    cancelAddTask();
    return;
  }
  creatingTask.value = true;
  try {
    const created = await guard(() => board.actions.createTask({ columnId, title }));
    if (created !== undefined) {
      addTaskColumnId.value = null;
      addTaskTitle.value = '';
    }
  } finally {
    creatingTask.value = false;
  }
};

const startEditTitle = (taskId: UUID, title: string): void => {
  editTitleValue.value = title;
  editTitleTaskId.value = taskId;
};
const commitEditTitle = async (taskId: UUID): Promise<void> => {
  const result = await guard(() => board.actions.updateTaskTitle(taskId, editTitleValue.value));
  // 失败（空标题等）保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
  if (result === undefined) return;
  editTitleTaskId.value = null;
};

/** 拖拽落点反馈（GitHub Projects 同款：插入线 / 列高亮 / 源卡片半透明）。 */
const dragging = ref<{ readonly kind: 'task' | 'column'; readonly id: UUID } | null>(null);
const dropTarget = ref<
  | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
  | { readonly kind: 'task-end'; readonly columnId: UUID }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' }
  | null
>(null);

const onTaskDragStart = (event: DragEvent, taskId: UUID): void => {
  event.dataTransfer?.setData('application/x-board-task', taskId);
  dragging.value = { kind: 'task', id: taskId };
};
const onColumnDragStart = (event: DragEvent, columnId: UUID): void => {
  event.dataTransfer?.setData('application/x-board-column', columnId);
  dragging.value = { kind: 'column', id: columnId };
};

const columnViews = (): CardDropColumnView[] =>
  board.columns.value.map(column => {
    const columnEl = document.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`);
    const rect = columnEl?.getBoundingClientRect();
    const cards = (taskMap.value.get(column.id) ?? [])
      .map(task => {
      const cardEl = document.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
      const cardRect = cardEl?.getBoundingClientRect();
      return cardRect ? { id: task.id, top: cardRect.top, bottom: cardRect.bottom } : null;
      })
      .filter((card): card is { readonly id: UUID; readonly top: number; readonly bottom: number } => card !== null);
    return {
      columnId: column.id,
      rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
      cards,
      taskIds: (taskMap.value.get(column.id) ?? []).map(task => task.id)
    };
  });

/** 卡片落点反馈：dragover 时预计算落点并标在目标卡片 / 空列上。 */
const onTaskDragOver = (event: DragEvent): void => {
  // 列头 handler 冒泡到这里，按拖拽类型分流，否则列拖拽的落点会被任务换算覆盖
  event.preventDefault();
  if (dragging.value?.kind !== 'task') return;
  const movedId = dragging.value.id;
  const target = resolveCardDrop(columnViews(), movedId, event.clientX, event.clientY);
  if (!target) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value =
    target.kind === 'end' ?
      { kind: 'task-end', columnId: target.columnId }
    : {
        kind: 'task',
        columnId: target.columnId,
        mode: target.prevId === null ? 'before' : 'after',
        taskId: (target.prevId ?? target.nextId)!
      };
};

/** 列头落点反馈：列间插入线。 */
const onColumnDragOver = (event: DragEvent): void => {
  event.preventDefault();
  if (dragging.value?.kind !== 'column') return;
  const movedId = dragging.value.id;
  const target = resolveColumnDrop(
    board.columns.value.map(column => {
      const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    }),
    board.columns.value.map(column => column.id),
    movedId,
    event.clientX
  );
  if (!target) {
    dropTarget.value = null;
    return;
  }
  const anchorId = target.prevId ?? target.nextId;
  if (anchorId === null) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value = { kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' };
};

const clearDragFeedback = (): void => {
  dragging.value = null;
  dropTarget.value = null;
};

const resolveTaskTarget = (movedId: UUID, clientX: number, clientY: number): CardDropTarget | null =>
  resolveCardDrop(columnViews(), movedId, clientX, clientY);

const resolveColumnTarget = (
  movedId: UUID,
  clientX: number
): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
  const views = board.columns.value.map(column => {
    const headerEl = document.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
    const rect = headerEl?.getBoundingClientRect();
    return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
  });
  const target = resolveColumnDrop(
    views,
    board.columns.value.map(column => column.id),
    movedId,
    clientX
  );
  return target;
};

const moveTaskAndSyncSnapshot = async (taskId: UUID, target: CardDropTarget): Promise<void> => {
  const previousSnapshot = snapshot.value;
  await board.actions.moveTask(taskId, target);
  if (detailTaskId.value !== taskId || snapshot.value !== previousSnapshot || previousSnapshot === null) return;
  snapshot.value = { ...previousSnapshot, columnId: target.columnId };
};

const onTaskDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  const movedId = (event.dataTransfer?.getData('application/x-board-task') ??
    (dragging.value?.kind === 'task' ? dragging.value.id : undefined)) as UUID | undefined;
  if (!movedId) return;
  clearDragFeedback();
  const target = resolveTaskTarget(movedId, event.clientX, event.clientY);
  if (!target) return;
  await guard(() => moveTaskAndSyncSnapshot(movedId, target));
};

const onColumnDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  const movedId = (event.dataTransfer?.getData('application/x-board-column') ??
    (dragging.value?.kind === 'column' ? dragging.value.id : undefined)) as UUID | undefined;
  if (!movedId) return;
  clearDragFeedback();
  const target = resolveColumnTarget(movedId, event.clientX);
  if (!target) return;
  await guard(() => board.actions.moveColumn(movedId, target));
};

const sortColumnBy = async (columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> => {
  if (sortingColumnId.value !== null) return;
  sortingColumnId.value = columnId;
  try {
    const result = await guard(() => board.actions.sortColumn(columnId, mode));
    if (result && !result.written) notice.value = '已按目标顺序排列，无变化';
  } finally {
    sortingColumnId.value = null;
  }
};

const moveColumnBy = async (columnId: UUID, direction: -1 | 1): Promise<void> => {
  const ids = board.columns.value.map(column => column.id);
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

const openDetail = async (taskId: UUID): Promise<void> => {
  if (detailTaskId.value === taskId) {
    invalidateDetailRequest();
    return;
  }
  if (isDetailDirty() && !window.confirm('有未保存的修改，切换任务将放弃。继续？')) return;
  const request = ++detailRequest;
  pendingDetailTaskId = taskId;
  const previousDraft = JSON.stringify(draft.value);
  const snap = await guard(() => board.actions.openSnapshot(taskId));
  if (request !== detailRequest) return;
  pendingDetailTaskId = null;
  if (!snap) return;
  if (JSON.stringify(draft.value) !== previousDraft) return;
  snapshot.value = snap;
  draft.value = {
    title: snap.title,
    description: snap.description ?? '',
    dueDate: snap.dueDate ?? '',
    labelIds: [...snap.labelIds]
  };
  detailTaskId.value = taskId;
  moveColumnId.value = snap.columnId;
  movePosition.value = 0;
};
const saveDetail = async (): Promise<void> => {
  if (!detailTaskId.value || !snapshot.value || savingDetail.value) return;
  const taskId = detailTaskId.value;
  const currentSnapshot = snapshot.value;
  const request = detailRequest;
  savingDetail.value = true;
  try {
    const result = await guard(() =>
      board.actions.saveTaskDraft(taskId, currentSnapshot, {
        title: draft.value.title,
        description: draft.value.description,
        dueDate: draft.value.dueDate === '' ? null : draft.value.dueDate,
        labelIds: draft.value.labelIds
      })
    );
    // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
    if (result === undefined || request !== detailRequest || snapshot.value !== currentSnapshot) return;
    invalidateDetailRequest();
    detailTaskId.value = null;
    snapshot.value = null;
  } finally {
    savingDetail.value = false;
  }
};

/** 详情草稿相对快照是否有未保存修改（US-539「详情」行：关闭 / 切板先确认放弃）。 */
const isDetailDirty = (): boolean =>
  snapshot.value !== null &&
  (draft.value.title !== snapshot.value.title ||
    draft.value.description !== (snapshot.value.description ?? '') ||
    draft.value.dueDate !== (snapshot.value.dueDate ?? '') ||
    [...draft.value.labelIds].sort().join(',') !== [...snapshot.value.labelIds].sort().join(','));

/** 关闭详情：有未保存修改先确认放弃（取消零写）。 */
const closeDetail = (): void => {
  if (isDetailDirty() && !window.confirm('有未保存的修改，关闭将放弃。继续？')) return;
  invalidateDetailRequest();
  detailTaskId.value = null;
  snapshot.value = null;
};

const moveCandidates = computed(() =>
  moveColumnId.value === null ?
    []
  : (taskMap.value.get(moveColumnId.value) ?? []).filter(task => task.id !== detailTaskId.value)
);

/** 菜单式移动（AC#6）：目标列 + 插入下标 → 核心换算表 → 移动；原位零写提示。 */
const moveTaskByMenu = async (): Promise<void> => {
  if (detailTaskId.value === null || moveColumnId.value === null) return;
  const taskId = detailTaskId.value;
  const target = resolveMenuMove(
    board.columns.value.map(column => ({
      columnId: column.id,
      taskIds: (taskMap.value.get(column.id) ?? []).map(task => task.id)
    })),
    detailTaskId.value,
    moveColumnId.value,
    movePosition.value
  );
  if (target === null) {
    notice.value = '任务已在该位置';
    return;
  }
  // moveTask 返回 void：guard 的成功与失败都表现为 undefined，直接调用以区分成败
  try {
    await moveTaskAndSyncSnapshot(taskId, target);
  } catch (error) {
    notice.value = error instanceof Error ? error.message : String(error);
    scheduleNoticeClear();
    return;
  }
  // 成功后焦点落在被移动对象（AC#6）：跨列 DOM 移动会丢焦点，固定时长内每帧重试
  const focusMovedCard = (taskId: UUID, attempts = 60): void => {
    const card = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (card !== null && card.isConnected) card.focus();
    if (attempts > 0) requestAnimationFrame(() => focusMovedCard(taskId, attempts - 1));
  };
  focusMovedCard(taskId);
};

const toggleDraftLabel = (labelId: UUID): void => {
  draft.value.labelIds =
    draft.value.labelIds.includes(labelId) ?
      draft.value.labelIds.filter(id => id !== labelId)
    : [...draft.value.labelIds, labelId];
};

const createLabel = async (): Promise<void> => {
  const name = promptTitle('新建标签：名称');
  if (name === null) return;
  const color = promptTitle('标签颜色（#rrggbb）', '#e11d48');
  if (color === null) return;
  await guard(() => board.actions.createLabel({ name, color }));
};
const renameLabel = async (labelId: UUID): Promise<void> => {
  const label = board.labels.value.find(item => item.id === labelId);
  if (!label) return;
  const name = promptTitle('改标签名', label.name);
  if (name === null) return;
  await guard(() => board.actions.renameLabel(labelId, name));
};
const recolorLabel = async (labelId: UUID): Promise<void> => {
  const label = board.labels.value.find(item => item.id === labelId);
  if (!label) return;
  const color = promptTitle('改标签颜色（#rrggbb）', label.color);
  if (color === null) return;
  await guard(() => board.actions.recolorLabel(labelId, color));
};
const deleteLabel = async (labelId: UUID): Promise<void> => {
  const plan = await guard(() => board.actions.planLabelDelete(labelId));
  if (!plan) return;
  if (!window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`)) return;
  await guard(() => board.actions.executeLabelDelete(plan));
};

const confirmTaskDelete = async (taskId: UUID): Promise<void> => {
  const plan = await guard(() => board.actions.planTaskDelete(taskId));
  if (!plan) return;
  confirm.value = { kind: 'task', taskId, title: plan.taskTitle, plan };
};
const confirmColumnDelete = async (columnId: UUID): Promise<void> => {
  const plan = await guard(() => board.actions.planColumnDelete(columnId));
  if (!plan) return;
  confirm.value = { kind: 'column', columnId, title: plan.columnTitle, count: plan.taskIds.length, plan };
};
const confirmBoardDelete = async (): Promise<void> => {
  const current = board.currentBoard.value;
  if (!current) return;
  const plan = await guard(() => board.actions.planBoardDelete(current.id));
  if (!plan) return;
  confirm.value = {
    kind: 'board',
    boardId: current.id,
    title: plan.boardTitle,
    count: plan.taskIds.length,
    columns: plan.columnIds.length,
    plan
  };
};
const executeConfirmedDelete = async (): Promise<void> => {
  const pending = confirm.value;
  if (!pending) return;
  confirm.value = null;
  const deleted = await guard(async () => {
    await board.actions.executeDelete(pending.plan);
    return true;
  });
  if (!deleted) return;
  const plan = pending.plan;
  const removedIds = plan.kind === 'task' ? [plan.taskId] : plan.taskIds;
  if (pendingDetailTaskId !== null && removedIds.includes(pendingDetailTaskId)) invalidateDetailRequest();
  const taskId = detailTaskId.value;
  if (taskId !== null && removedIds.includes(taskId)) {
    detailTaskId.value = null;
    snapshot.value = null;
  }
  if (plan.kind === 'board') onSearchInputValue('');
};

const dueDateText = (due: string | null): string => {
  if (!due) return '';
  return (
    due < today.value ? `已逾期 ${due}`
    : due === today.value ? `今天到期 ${due}`
    : due
  );
};

const labelsOf = (taskId: UUID): readonly BoardLabel[] => board.taskLabels.value.get(taskId) ?? [];

const onSelectBoard = (event: Event): void => {
  const selector = event.target as HTMLSelectElement;
  const boardId = selector.value as UUID;
  if (detailTaskId.value !== null) {
    if (isDetailDirty() && !window.confirm('切板将放弃未保存的修改。继续？')) {
      selector.value = board.currentBoardId.value ?? '';
      return;
    }
    detailTaskId.value = null;
    snapshot.value = null;
  }
  invalidateDetailRequest();
  board.selectBoard(boardId);
  // 切板丢弃旧板结果：销毁重建句柄重发（setQuery 同词会被 distinctUntilChanged 吞掉）
  const query = searchQuery.value.trim();
  if (query !== '') {
    destroySearch();
    onSearchInputValue(query);
  }
};

const onRenameBoard = (): void => {
  const current = board.currentBoard.value;
  if (!current) return;
  const title = promptTitle('改板标题', current.title);
  if (title !== null) void guard(() => board.actions.updateBoard(current.id, { title }));
};

const onRenameColumn = (columnId: UUID): void => {
  const column = board.columns.value.find(item => item.id === columnId);
  if (!column) return;
  const title = promptTitle('改列标题', column.title);
  if (title !== null) void guard(() => board.actions.updateColumn(columnId, { title }));
};

const exportBackup = (): void => {
  if (props.onExportBackup) void props.onExportBackup();
  else notice.value = '备份导出由宿主接线（US-537）';
};

type ConfirmState = { readonly plan: DeletePlan } & (
  | { readonly kind: 'task'; readonly taskId: UUID; readonly title: string }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly title: string; readonly count: number }
  | {
      readonly kind: 'board';
      readonly boardId: UUID;
      readonly title: string;
      readonly count: number;
      readonly columns: number;
    }
);

// 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
const applyRestoringFromStorage = (): void => {
  board.setRestoring(typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null);
};
onMounted(() => {
  window.addEventListener('storage', applyRestoringFromStorage);
  window.addEventListener('focus', refreshToday);
  document.addEventListener('visibilitychange', refreshToday);
  applyRestoringFromStorage();
  refreshToday();
});
onBeforeUnmount(() => {
  window.removeEventListener('storage', applyRestoringFromStorage);
  window.removeEventListener('focus', refreshToday);
  document.removeEventListener('visibilitychange', refreshToday);
  if (todayTimer !== null) window.clearTimeout(todayTimer);
});
</script>

<template>
  <section
    class="board-view"
    data-testid="board-view"
    @dragover.prevent
    @dragend="clearDragFeedback"
    @drop="onColumnDrop"
  >
    <header
      class="board-header"
      data-testid="board-header"
    >
      <select
        class="board-selector"
        :value="board.currentBoardId.value ?? ''"
        data-testid="board-selector"
        aria-label="选择看板"
        @change="onSelectBoard"
      >
        <option
          v-for="item in board.boards.value"
          :key="item.id"
          :value="item.id"
        >
          {{ item.title }}
        </option>
      </select>
      <button
        v-if="board.currentBoard.value"
        class="header-button"
        data-testid="rename-board"
        aria-label="改板标题"
        @click="onRenameBoard"
      >
        {{ board.currentBoard.value.title }}
      </button>
      <span
        v-if="board.restoring.value"
        class="restoring-badge"
        data-testid="restoring-badge"
        aria-live="polite"
        >恢复中</span
      >
      <div class="header-actions">
        <button
          data-testid="create-board"
          :disabled="board.restoring.value || board.loading.value || board.readError.value !== null"
          @click="createBoard"
        >
          新建板
        </button>
        <button
          data-testid="delete-board"
          :disabled="board.restoring.value || board.loading.value || board.readError.value !== null || !board.currentBoard.value"
          @click="confirmBoardDelete"
        >
          删除看板
        </button>
        <button
          data-testid="create-column"
          :disabled="board.restoring.value || board.loading.value || board.readError.value !== null || !board.currentBoard.value"
          @click="createColumn"
        >
          新建列
        </button>
        <button
          data-testid="create-label"
          :disabled="board.restoring.value || board.loading.value || board.readError.value !== null || !board.currentBoard.value"
          @click="createLabel"
        >
          新建标签
        </button>
        <button
          data-testid="undo"
          :disabled="board.restoring.value || board.undoCount.value === 0"
          aria-label="撤销"
          @click="() => void guard(() => board.actions.undo())"
        >
          撤销
        </button>
        <button
          data-testid="redo"
          :disabled="board.restoring.value || board.redoCount.value === 0"
          aria-label="重做"
          @click="() => void guard(() => board.actions.redo())"
        >
          重做
        </button>
        <button
          data-testid="export-backup"
          :disabled="board.restoring.value || board.loading.value || board.readError.value !== null"
          @click="exportBackup"
        >
          导出备份
        </button>
      </div>
    </header>

    <p
      v-if="board.loading.value"
      class="board-notice"
      data-testid="board-loading"
      role="status"
    >正在读取看板数据…</p>
    <p
      v-else-if="board.readError.value"
      class="board-notice"
      data-testid="board-read-error"
      role="alert"
    >
      读取看板数据失败：{{ board.readError.value }}
      <button data-testid="board-read-retry" @click="board.retryReads">重试</button>
    </p>
    <p
      v-if="board.restoring.value"
      class="restoring-note"
      data-testid="restoring-note"
    >
      恢复进行中：浏览可用，写入口已暂停。
    </p>

    <p
      v-if="notice"
      class="board-notice"
      role="alert"
      data-testid="board-notice"
    >
      {{ notice }}
      <button
        data-testid="board-notice-close"
        aria-label="关闭提示"
        @click="notice = null"
      >
        ×
      </button>
    </p>

    <template v-if="board.currentBoard.value">
      <div
        v-if="board.labels.value.length > 0"
        class="label-strip"
        data-testid="label-strip"
      >
        <span
          v-for="label in board.labels.value"
          :key="label.id"
          class="label-chip"
          :style="{ background: label.color, color: labelTextColor(label.color) }"
          data-testid="label-chip"
        >
          <button
            class="label-name"
            aria-label="改名"
            @click="renameLabel(label.id)"
            >{{ label.name }}</button
          >
          <button
            class="label-recolor"
            :aria-label="`改标签颜色 ${label.name}`"
            data-testid="label-recolor"
            @click="recolorLabel(label.id)"
          >◉</button>
          <button
            class="label-delete"
            :aria-label="`删除标签 ${label.name}`"
            @click="deleteLabel(label.id)"
            >×</button
          >
        </span>
      </div>

      <!-- 板内搜索（US-539 阶段 B） -->
      <div
        v-if="board.searchSource || board.searchUnavailableReason"
        class="board-search"
        data-testid="board-search"
      >
        <input
          class="search-input"
          :value="searchQuery"
          :disabled="!board.searchSource && board.searchUnavailableReason !== null"
          :placeholder="board.searchSource ? '搜索当前板任务' : searchUnavailableText(board.searchUnavailableReason)"
          aria-label="搜索当前板任务"
          data-testid="board-search-input"
          @input="onSearchInput"
        />
        <span
          v-if="!board.searchSource"
          class="search-unavailable"
          data-testid="board-search-unavailable"
        >{{ searchUnavailableText(board.searchUnavailableReason) }}</span>
        <div
          v-if="searchQuery.trim() !== ''"
          class="search-results"
          data-testid="board-search-results"
        >
          <p
            v-if="searchState === 'loading'"
            class="search-state"
            data-testid="board-search-loading"
          >
            搜索中…
          </p>
          <p
            v-else-if="searchState === 'error'"
            class="search-state"
            data-testid="board-search-error"
          >
            {{ searchErrorText }}
          </p>
          <p
            v-else-if="searchState === 'empty'"
            class="search-state"
            data-testid="board-search-empty"
          >
            无匹配
          </p>
          <template v-else>
            <button
              v-for="result in searchResults"
              :key="result.id"
              class="search-result"
              data-testid="board-search-result"
              @click="onSearchResultClick(result)"
            >
              <span class="search-result-title">{{ searchResultTitle(result) }}</span>
              <span class="search-result-column">{{ searchResultColumn(result) }}</span>
              <span class="search-result-snippet">{{ result.snippet }}</span>
            </button>
            <button
              v-if="searchHasMore"
              class="search-more"
              data-testid="board-search-more"
              :disabled="searchState === 'loading'"
              @click="onSearchMore"
            >
              加载更多
            </button>
          </template>
        </div>
      </div>

      <div
        class="columns"
        data-testid="columns"
      >
        <p v-if="board.columns.value.length > 1" class="columns-scroll-hint" aria-hidden="true">可横向滚动查看更多列</p>
        <section
          v-for="column in board.columns.value"
          :key="column.id"
          :class="{ column: true, 'drop-end': dropTarget?.kind === 'task-end' && dropTarget.columnId === column.id }"
          :data-column-id="column.id"
          data-testid="column"
          @dragover="onTaskDragOver"
          @drop="event => void onTaskDrop(event)"
        >
          <header
            :class="{
              'column-header': true,
              'drop-before':
                dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'before',
              'drop-after':
                dropTarget?.kind === 'column' && dropTarget.columnId === column.id && dropTarget.mode === 'after',
              dragging: dragging?.kind === 'column' && dragging.id === column.id
            }"
            :data-column-header-id="column.id"
            :aria-label="`列：${column.title}`"
            draggable="true"
            data-testid="column-header"
            @dragover="onColumnDragOver"
            @dragstart="event => onColumnDragStart(event, column.id)"
          >
            <h2
              class="column-title"
              data-testid="column-title"
            >
              {{ column.title }}
            </h2>
            <span
              class="column-count"
              data-testid="column-count"
              >{{ (taskMap.get(column.id) ?? []).length }}</span
            >
            <div class="column-menu">
              <button
                data-testid="column-rename"
                aria-label="改列名"
                @click="onRenameColumn(column.id)"
              >
                改名
              </button>
              <button
                data-testid="column-move-back"
                aria-label="前移"
                @click="moveColumnBy(column.id, -1)"
              >
                前移
              </button>
              <button
                data-testid="column-move-forward"
                aria-label="后移"
                @click="moveColumnBy(column.id, 1)"
              >
                后移
              </button>
              <button
                data-testid="column-sort-due"
                aria-label="按截止日排序"
                :disabled="sortingColumnId === column.id"
                @click="sortColumnBy(column.id, 'dueDate')"
              >
                按截止日
              </button>
              <button
                data-testid="column-sort-title"
                aria-label="按标题排序"
                :disabled="sortingColumnId === column.id"
                @click="sortColumnBy(column.id, 'title')"
              >
                按标题
              </button>
              <button
                data-testid="column-delete"
                aria-label="删除列"
                @click="confirmColumnDelete(column.id)"
              >
                删除
              </button>
            </div>
          </header>
          <div class="cards">
            <article
              v-for="task in taskMap.get(column.id) ?? []"
              :key="task.id"
              :class="{
                card: true,
                'search-hit': searchHighlightId === task.id,
                'drop-before':
                  dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'before',
                'drop-after':
                  dropTarget?.kind === 'task' && dropTarget.taskId === task.id && dropTarget.mode === 'after',
                dragging: dragging?.kind === 'task' && dragging.id === task.id
              }"
              :data-task-id="task.id"
              :aria-label="`任务：${task.title}`"
              tabindex="-1"
              draggable="true"
              data-testid="task-card"
              @dragstart="event => onTaskDragStart(event, task.id)"
            >
              <template v-if="editTitleTaskId === task.id">
                <input
                  v-model="editTitleValue"
                  class="title-editor"
                  data-testid="task-title-editor"
                  aria-label="任务标题"
                  @keydown.enter="commitEditTitle(task.id)"
                  @keydown.escape="editTitleTaskId = null"
                />
                <button
                  data-testid="task-title-save"
                  aria-label="保存标题"
                  @click="commitEditTitle(task.id)"
                >
                  保存
                </button>
                <button
                  data-testid="task-title-cancel"
                  aria-label="取消"
                  @click="editTitleTaskId = null"
                >
                  取消
                </button>
              </template>

              <template v-else>
                <button
                  class="card-title"
                  data-testid="task-title"
                  @click="openDetail(task.id)"
                >
                  {{ task.title }}
                </button>
                <button
                  class="card-edit"
                  data-testid="task-edit-title"
                  aria-label="编辑标题"
                  @click="startEditTitle(task.id, task.title)"
                >
                  编辑
                </button>
              </template>

              <div
                v-if="labelsOf(task.id).length > 0"
                class="card-labels"
              >
                <span
                  v-for="label in labelsOf(task.id)"
                  :key="label.id"
                  class="card-label"
                  :style="{ background: label.color, color: labelTextColor(label.color) }"
                  data-testid="card-label"
                  :aria-label="label.name"
                  >{{ label.name }}</span
                >
              </div>
              <span
                v-if="dueDateText(task.dueDate)"
                class="card-due"
                :class="{ overdue: dueDateText(task.dueDate).startsWith('已逾期') }"
                data-testid="task-due"
                >{{ dueDateText(task.dueDate) }}</span
              >
            </article>
            <button
              class="add-task"
              :disabled="board.restoring.value || creatingTask"
              data-testid="add-task"
              @click="openAddTask(column.id)"
            >
              + 添加任务
            </button>
            <div
              v-if="addTaskColumnId === column.id"
              class="add-task-form"
              data-testid="add-task-form"
            >
              <input
                v-model="addTaskTitle"
                class="add-task-input"
                placeholder="输入任务标题"
                aria-label="新任务标题"
                data-testid="add-task-input"
                :disabled="creatingTask"
                @keydown.enter="commitAddTask"
                @keydown.esc="cancelAddTask"
              />
              <button
                class="add-task-submit"
                :disabled="creatingTask || addTaskTitle.trim() === ''"
                data-testid="add-task-submit"
                @click="commitAddTask"
              >
                添加
              </button>
              <button
                class="add-task-cancel"
                aria-label="取消"
                data-testid="add-task-cancel"
                :disabled="creatingTask"
                @click="cancelAddTask"
              >
                ×
              </button>
            </div>
          </div>
        </section>
      </div>

      <aside
        v-if="detailTaskId"
        class="detail-panel"
        data-testid="detail-panel"
      >
        <h3>任务详情</h3>
        <label>
          标题
          <input
            v-model="draft.title"
            data-testid="detail-title"
            :disabled="savingDetail"
          />
        </label>
        <label>
          描述
          <textarea
            v-model="draft.description"
            data-testid="detail-description"
            :disabled="savingDetail"
          />
        </label>
        <label>
          截止日（YYYY-MM-DD）
          <input
            v-model="draft.dueDate"
            placeholder="YYYY-MM-DD"
            data-testid="detail-due"
            :disabled="savingDetail"
          />
        </label>
        <fieldset>
          <legend>标签</legend>
          <label
            v-for="label in board.labels.value"
            :key="label.id"
            class="detail-label"
          >
            <input
              type="checkbox"
              :checked="draft.labelIds.includes(label.id)"
              data-testid="detail-label-check"
              :disabled="savingDetail"
              @change="toggleDraftLabel(label.id)"
            />
            <span :style="{ background: label.color, color: labelTextColor(label.color) }">{{ label.name }}</span>
          </label>
        </fieldset>
        <div
          class="detail-move"
          data-testid="detail-move"
        >
          <label>
            移动到
            <select
              :value="moveColumnId ?? ''"
              aria-label="移动到列"
              data-testid="move-column"
              :disabled="savingDetail"
              @change="onMoveColumnChange"
            >
              <option
                v-for="column in board.columns.value"
                :key="column.id"
                :value="column.id"
              >
                {{ column.title }}
              </option>
            </select>
          </label>
          <label>
            位置
            <select
              :value="movePosition"
              aria-label="位置"
              data-testid="move-position"
              :disabled="savingDetail"
              @change="onMovePositionChange"
            >
              <option :value="0">列首</option>
              <option
                v-for="(task, index) in moveCandidates"
                :key="task.id"
                :value="index + 1"
                >在「{{ task.title }}」之后</option
              >
              <option :value="moveCandidates.length">列尾</option>
            </select>
          </label>
          <button
            data-testid="move-task"
            :disabled="savingDetail"
            @click="moveTaskByMenu"
          >
            移动
          </button>
        </div>
        <div class="detail-actions">
          <button
            data-testid="detail-save"
            :disabled="savingDetail"
            @click="saveDetail"
          >
            保存
          </button>
          <button
            data-testid="detail-delete"
            @click="confirmTaskDelete(detailTaskId!)"
          >
            删除任务
          </button>
          <button
            data-testid="detail-cancel"
            @click="closeDetail"
          >
            取消
          </button>
        </div>
      </aside>

      <aside
        v-if="confirm"
        class="confirm-panel"
        data-testid="confirm-delete"
      >
        <p v-if="confirm.kind === 'task'"> 删除任务「{{ confirm.title }}」及其 {{ confirm.plan.taskLabelIds.length }} 条标签关联？ </p>
        <p v-else-if="confirm.kind === 'column'"> 删除列「{{ confirm.title }}」及其 {{ confirm.count }} 个任务、{{ confirm.plan.taskLabelIds.length }} 条任务标签关联？ </p>
        <p v-else>
          删除看板「{{ confirm.title }}」（{{ confirm.columns }} 列、{{ confirm.count }}
          任务、{{ confirm.plan.boardLabelIds.length }} 个标签定义、{{ confirm.plan.taskLabelIds.length }} 条任务标签关联）？
        </p>
        <div class="confirm-actions">
          <button
            data-testid="confirm-delete-yes"
            @click="executeConfirmedDelete"
          >
            确认删除
          </button>
          <button
            data-testid="confirm-delete-no"
            @click="confirm = null"
          >
            取消
          </button>
        </div>
      </aside>
    </template>
    <div
      v-else-if="!board.loading.value && !board.readError.value"
      class="empty-board"
      data-testid="empty-board"
    >
        <p>{{ board.boards.value.length === 0 ? '没有看板' : '请选择看板' }}</p>
      <button
        data-testid="create-board-empty"
        :disabled="board.restoring.value || board.loading.value || board.readError.value !== null"
        @click="createBoard"
      >
        新建板
      </button>
    </div>
  </section>
</template>

<style scoped>
/* 看板布局（US-539 交互约定：列横向排列、任务卡片纵向堆叠、列横向滚动；详情/确认面板固定右侧） */
.board-view {
  display: block;
  padding-bottom: 4rem;
}
.board-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  flex-wrap: wrap;
}
.board-selector {
  padding: 0.25rem;
}
.header-button {
  background: none;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}
.header-actions {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}
.restoring-badge {
  background: #f59e0b;
  color: #fff;
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}
.restoring-note {
  padding: 0.25rem 1rem;
  color: #92400e;
}
.label-strip {
  display: flex;
  gap: 0.375rem;
  padding: 0.25rem 1rem;
  flex-wrap: wrap;
}
.label-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 0.25rem;
  padding: 0 0.375rem;
  color: #fff;
  font-size: 0.75rem;
}
.label-name,
.label-recolor,
.label-delete {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}
.board-notice {
  padding: 0.25rem 1rem;
  color: #b91c1c;
}
.columns {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.5rem 1rem;
  align-items: flex-start;
}
.columns-scroll-hint {
  position: sticky;
  left: 1rem;
  flex: 0 0 auto;
  margin: 0;
  align-self: center;
  color: #64748b;
  font-size: 0.75rem;
  writing-mode: vertical-rl;
}
.column {
  flex: 0 0 17rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.column-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
}
.column-title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  flex: 1;
}
.column-count {
  font-size: 0.75rem;
  color: #64748b;
}
.column-menu {
  display: flex;
  gap: 0.125rem;
  flex-wrap: wrap;
}
.column-menu button {
  font-size: 0.75rem;
  padding: 0.125rem 0.25rem;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.375rem;
}
.card {
  background: #fff;
  border-radius: 0.375rem;
  padding: 0.5rem;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.card-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  text-align: left;
  padding: 0;
  width: 100%;
}
.card-edit {
  font-size: 0.75rem;
}
.card-labels {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}
.card-label {
  padding: 0 0.375rem;
  border-radius: 0.25rem;
  color: #fff;
  font-size: 0.75rem;
}
.card-due {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #64748b;
}
.card-due.overdue {
  color: #dc2626;
}
.add-task-form {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
}
.add-task-input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.5rem;
}
.add-task-cancel {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
}
.detail-move {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: flex-end;
  margin-top: 0.5rem;
}
.detail-move label {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 0.75rem;
}
.add-task {
  width: 100%;
  margin-top: 0.25rem;
}
.title-editor {
  width: 100%;
  box-sizing: border-box;
}
.empty-board {
  padding: 2rem;
}
.detail-panel,
.confirm-panel {
  position: fixed;
  right: 1rem;
  top: 4rem;
  width: 20rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  z-index: 10;
  max-height: calc(100vh - 6rem);
  overflow-y: auto;
}
.detail-panel label {
  display: block;
  margin-bottom: 0.5rem;
}
.detail-panel input,
.detail-panel textarea {
  width: 100%;
  box-sizing: border-box;
}
.detail-actions,
.confirm-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
@media (max-width: 48rem) {
  .detail-panel,
  .confirm-panel {
    right: 1rem;
    left: 1rem;
    width: auto;
    box-sizing: border-box;
  }
}
/* 拖拽落点反馈（GitHub Projects 同款：插入线 / 列高亮 / 源卡片半透明） */
.card.dragging,
.column-header.dragging {
  opacity: 0.5;
}
.card.drop-before {
  box-shadow: 0 -3px 0 0 #0969da;
}
.card.drop-after {
  box-shadow: 0 3px 0 0 #0969da;
}
.column.drop-end {
  outline: 3px dashed #0969da;
  outline-offset: -3px;
  border-radius: 0.5rem;
}
.column-header.drop-before {
  box-shadow: -3px 0 0 0 #0969da;
}
.column-header.drop-after {
  box-shadow: 3px 0 0 0 #0969da;
}
/* 板内搜索（US-539 阶段 B） */
.search-hit {
  outline: 3px solid #f59e0b;
  outline-offset: 2px;
}
.board-search {
  padding: 0.25rem 1rem;
}
.board-search .search-input {
  width: 100%;
  max-width: 24rem;
  padding: 0.25rem 0.5rem;
}
.search-results {
  margin-top: 0.25rem;
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  background: #fff;
}
.search-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border: none;
  border-bottom: 1px solid #f1f5f9;
  background: none;
  cursor: pointer;
  text-align: left;
}
.search-result:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.search-result-title {
  font-size: 0.875rem;
  font-weight: 600;
}
.search-result-column {
  font-size: 0.75rem;
  color: #64748b;
}
.search-result-snippet {
  font-size: 0.75rem;
  color: #334155;
}
.search-state {
  padding: 0.5rem;
  color: #64748b;
}
.search-more {
  margin: 0.25rem;
}
</style>
