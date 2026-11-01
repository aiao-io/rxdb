<script setup lang="ts">
import type { UUID } from '@aiao/rxdb';
import {
  BOARD_LABEL_COLORS,
  focusModalTab,
  dropIndicatorAnchor,
  dueStatus,
  dueStatusText,
  isBoardFilterEmpty,
  isHexColor,
  labelTextColor,
  localDateKey,
  matchesBoardFilter,
  msUntilNextLocalMidnight,
  nextGridFocus,
  nextLabelColor,
  parseBoardFilter,
  placePopover,
  resolveCardDrop,
  resolveColumnDrop,
  resolveKeyboardMove,
  resolveMenuMove,
  RESTORING_MARKER_KEY,
  suggestBoardFilter,
  toggleBoardFilterValue,
  type BoardGridDirection,
  type BoardLabel,
  type BoardMoveDirection,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream,
  type CardDropColumnView,
  type CardDropTarget,
  type Column,
  type DeletePlan,
  type DueStatus,
  type LabelDeletePlan,
  type SearchHandle,
  type SearchResult,
  type Task,
  type TaskDraftSnapshot,
  type TaskFieldPatch
} from '@aiao/rxdb-plugin-board';
import { Subscription } from 'rxjs';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, useId, useTemplateRef, watch } from 'vue';

import { useBoard } from './use-board.js';

/**
 * 看板视图组件（看板 v2，GitHub Projects 风格）：页头 + 筛选条 + 列 / 卡片 + 叠加详情侧栏 +
 * 根层菜单 / 选择器 + 模态对话框 + 带撤销的操作提示。
 *
 * 动作收进上下文菜单、就地编辑即改即存（每次改动一个可撤销事务）、一个选择器与一套筛选语法走天下。
 * 三端只采集指针 / 键盘事件，落点、键盘目标、筛选与弹层定位都调用核心包同一份纯函数；
 * 全部写入口经 {@link useBoard} 的领域动作（恢复中写门禁与校验在服务层复核，不靠隐藏按钮）。
 * DOM 契约（`rxb-` 类名 + data-testid）与 Angular / React 同构；样式即核心包共用的
 * `@aiao/rxdb-plugin-board/board.css`，随本组件打进发布包的 `board-view.css` 子路径（与 React / Angular 绑定同名）。
 */
const props = defineProps<{
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  rxdb: Parameters<typeof useBoard>[0];
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。Angular 绑定的同一输入名为 `exportBackup`。 */
  onExportBackup?: () => void | Promise<void>;
}>();

/** 弹层种类：菜单（板 / 列 / 卡片）与选择器（移到列 / 详情所在列 / 详情标签）。 */
type BoardPopoverKind =
  'board-menu' | 'column-menu' | 'task-menu' | 'move-picker' | 'detail-column-picker' | 'detail-label-picker';

interface DetailSession {
  readonly taskId: UUID;
  readonly actions: ReturnType<typeof useBoard>['actions'];
  base: TaskDraftSnapshot;
}

interface PopoverState {
  readonly kind: BoardPopoverKind;
  readonly targetId: UUID | null;
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

type DialogState =
  | { readonly kind: 'confirm-delete'; readonly plan: DeletePlan }
  | { readonly kind: 'confirm-label-delete'; readonly plan: LabelDeletePlan }
  | { readonly kind: 'board-composer' }
  | { readonly kind: 'labels' }
  | { readonly kind: 'search' }
  | { readonly kind: 'shortcuts' };

interface LabelEditorState {
  readonly labelId: UUID | null;
  readonly name: string;
  readonly color: string;
}

interface PickerOption {
  readonly id: UUID;
  readonly label: string;
  readonly color: string | null;
  readonly selected: boolean;
}

type DropTarget =
  | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
  | { readonly kind: 'task-end'; readonly columnId: UUID }
  | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' };

type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';

const POPOVER_WIDTH: Readonly<Record<BoardPopoverKind, number>> = {
  'board-menu': 240,
  'column-menu': 240,
  'task-menu': 240,
  'move-picker': 280,
  'detail-column-picker': 280,
  'detail-label-picker': 280
};

/** 弹层高度估算（定位用；超出视口时 CSS max-height 兜住滚动）。 */
const POPOVER_HEIGHT: Readonly<Record<BoardPopoverKind, number>> = {
  'board-menu': 140,
  'column-menu': 340,
  'task-menu': 280,
  'move-picker': 320,
  'detail-column-picker': 320,
  'detail-label-picker': 360
};

const FOCUS_KEYS: Readonly<Record<string, BoardGridDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'first',
  End: 'last'
};

const MOVE_KEYS: Readonly<Record<string, BoardMoveDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

const SHORTCUT_GROUPS = [
  {
    title: '导航',
    items: [
      { label: '在卡片间移动', keys: ['↑', '↓', '←', '→'] },
      { label: '本列第一张 / 最后一张', keys: ['Home', 'End'] },
      { label: '聚焦筛选', keys: ['/'] },
      { label: '搜索任务', keys: ['⌘/Ctrl', 'K'] },
      { label: '显示快捷键', keys: ['?'] }
    ]
  },
  {
    title: '卡片',
    items: [
      { label: '打开详情', keys: ['Enter'] },
      { label: '编辑标题', keys: ['F2'] },
      { label: '上移 / 下移', keys: ['⌥', '↑', '↓'] },
      { label: '移到相邻列', keys: ['⌥', '←', '→'] },
      { label: '删除', keys: ['Del'] },
      { label: '更多操作', keys: ['⇧', 'F10'] }
    ]
  },
  {
    title: '编辑',
    items: [
      { label: '撤销', keys: ['⌘/Ctrl', 'Z'] },
      { label: '重做', keys: ['⇧', '⌘/Ctrl', 'Z'] },
      { label: '关闭菜单 / 对话框 / 详情', keys: ['Esc'] }
    ]
  }
] as const;

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const isModifier = (event: KeyboardEvent): boolean => event.metaKey || event.ctrlKey;

// Vue 会把 props 包成 reactive 代理：类实例（EntityManager 等）经代理调用
// 会丢私有成员与原型链，必须取回原始对象（Vue 官方 toRaw 语义）
const rxdb = toRaw(props.rxdb);
const installedSearch = rxdb.getPlugins('search')[0] as { readonly searchCollection?: unknown } | undefined;
const searchUpstream =
  installedSearch && typeof installedSearch.searchCollection === 'function' ? installedSearch : undefined;
const unavailableReason: BoardSearchUnavailableReason | undefined =
  installedSearch === undefined ? 'plugin_not_installed'
  : searchUpstream === undefined ? 'adapter_unsupported'
  : undefined;
const board = useBoard(
  rxdb,
  searchUpstream ?
    { search: { upstream: searchUpstream as BoardSearchUpstream } }
  : { searchUnavailableReason: unavailableReason }
);
const {
  boards,
  currentBoardId,
  currentBoard,
  columns,
  tasks,
  labels,
  taskLabels,
  restoring,
  loading,
  readError,
  undoCount,
  redoCount
} = board;

let noticeTimer: number | null = null;
let toastTimer: number | null = null;
let todayTimer: number | null = null;
let highlightTimer: number | null = null;
let searchHandle: SearchHandle | null = null;
let searchSubs = new Subscription();
let detailRequest = 0;
let pendingDetailTaskId: UUID | null = null;
let detailQueue: Promise<unknown> = Promise.resolve();
let detailSession: DetailSession | null = null;
let returnFocus: HTMLElement | null = null;
let pickerLabelDraft: readonly UUID[] = [];

const boardArea = useTemplateRef<HTMLElement>('board-area');
const today = ref(localDateKey(new Date()));
const notice = ref<string | null>(null);
const toast = shallowRef<{ readonly message: string; readonly undoable: boolean } | null>(null);
const popover = shallowRef<PopoverState | null>(null);
const dialog = shallowRef<DialogState | null>(null);

const uid = useId();
const suggestionListId = `rxb-${uid}-suggestions`;
const dialogTitleId = `rxb-${uid}-dialog-title`;
const detailDescriptionId = `rxb-${uid}-description`;
const detailDueId = `rxb-${uid}-due`;
const labelColors = BOARD_LABEL_COLORS;
const shortcutGroups = SHORTCUT_GROUPS;

// ---------- 拖拽 ----------
const dragging = shallowRef<{ readonly kind: 'task' | 'column'; readonly id: UUID } | null>(null);
const dropTarget = shallowRef<DropTarget | null>(null);

// ---------- 就地编辑 ----------
const editingBoardTitle = ref(false);
const boardTitleDraft = ref('');
const editingBoardDescription = ref(false);
const boardDescriptionDraft = ref('');
const editingColumnId = ref<UUID | null>(null);
const columnTitleDraft = ref('');
const editingTaskId = ref<UUID | null>(null);
const taskTitleDraft = ref('');
const addTaskColumnId = ref<UUID | null>(null);
const addTaskTitle = ref('');
const creatingTask = ref(false);
const addingColumn = ref(false);
const addColumnTitle = ref('');
const boardComposerTitle = ref('');
const labelEditor = shallowRef<LabelEditorState | null>(null);
const sortingColumnId = ref<UUID | null>(null);

// ---------- 详情侧栏（即改即存） ----------
const detailTaskId = ref<UUID | null>(null);
const detailBase = shallowRef<TaskDraftSnapshot | null>(null);
const detailTitle = ref('');
const detailDescription = ref('');
const detailStatus = ref<string | null>(null);
/**
 * 截止日输入框的草稿镜像：Vue 每次重渲染都会把 `:value` 强制写回 DOM（Angular 只在绑定值变化时写），
 * 直接绑基线会在「保存中…」重渲染时把用户刚选的日期刷回旧值、保存失败时丢掉输入。
 * 镜像随输入更新，只在基线截止日变化时同步（等价于 Angular 的绑定语义）。
 */
const detailDue = ref('');

// ---------- 选择器 ----------
const pickerQuery = ref('');
const pickerActive = ref(0);
const pickerSelection = shallowRef<readonly UUID[]>([]);

// ---------- 筛选 ----------
const filterQuery = ref('');
const filterFocused = ref(false);
const activeSuggestion = ref(-1);
const suggestionsDismissed = ref(false);

// ---------- 键盘焦点 ----------
const focusedTaskId = ref<UUID | null>(null);

// ---------- 搜索（US-539 阶段 B，移入对话框） ----------
const searchQuery = ref('');
const searchState = ref<SearchState>('idle');
const searchResults = shallowRef<readonly SearchResult[]>([]);
const searchHasMore = ref(false);
const searchErrorText = ref<string | null>(null);
const searchHighlightId = ref<UUID | null>(null);

const writeLocked = computed(() => restoring.value || loading.value || readError.value !== null);

const taskMap = computed(() => {
  const grouped = new Map<UUID, Task[]>();
  for (const column of columns.value) grouped.set(column.id, []);
  for (const task of tasks.value) grouped.get(task.columnId)?.push(task);
  return grouped;
});

const filter = computed(() => parseBoardFilter(filterQuery.value));
const filterActive = computed(() => !isBoardFilterEmpty(filter.value));

const visibleTaskMap = computed(() => {
  const visible = new Map<UUID, readonly Task[]>();
  const parsed = filter.value;
  const active = filterActive.value;
  const day = today.value;
  for (const column of columns.value) {
    const columnTasks = taskMap.value.get(column.id) ?? [];
    const matches = (task: Task) =>
      matchesBoardFilter(
        {
          title: task.title,
          description: task.description ?? null,
          dueDate: task.dueDate ?? null,
          columnTitle: column.title,
          labelNames: labelsOf(task.id).map(label => label.name)
        },
        parsed,
        day
      );
    visible.set(column.id, active ? columnTasks.filter(matches) : columnTasks);
  }
  return visible;
});

const visibleCount = computed(() => [...visibleTaskMap.value.values()].reduce((sum, list) => sum + list.length, 0));

const suggestions = computed(() =>
  suggestBoardFilter(filterQuery.value, {
    labels: labels.value,
    columns: columns.value.map(column => column.title)
  })
);

const suggestionsOpen = computed(
  () => filterFocused.value && !suggestionsDismissed.value && suggestions.value.length > 0
);

const activeSuggestionId = computed(() =>
  suggestionsOpen.value && activeSuggestion.value >= 0 ? `${suggestionListId}-${activeSuggestion.value}` : null
);

const filteredLabelNames = computed(() =>
  filter.value.terms
    .filter(term => term.field === 'label' && !term.negated)
    .flatMap(term => term.values.map(value => value.toLowerCase()))
);

/** 漫游 tabindex：上次聚焦的可见卡片，否则第一张可见卡片。 */
const rovingTaskId = computed(() => {
  const visibleIds = [...visibleTaskMap.value.values()].flat().map(task => task.id);
  const focused = focusedTaskId.value;
  return focused !== null && visibleIds.includes(focused) ? focused : (visibleIds[0] ?? null);
});

const detailLabels = computed(() => {
  const base = detailBase.value;
  if (!base) return [];
  return labels.value.filter(label => base.labelIds.includes(label.id));
});

const pickerOptions = computed<readonly PickerOption[]>(() => {
  const pop = popover.value;
  if (!pop) return [];
  const query = pickerQuery.value.trim().toLowerCase();
  const selection = pickerSelection.value;
  const options =
    pop.kind === 'detail-label-picker' ?
      labels.value.map(label => ({ id: label.id, label: label.name, color: label.color }))
    : columns.value.map(column => ({ id: column.id, label: column.title, color: null }));
  return options
    .filter(option => option.label.toLowerCase().includes(query))
    .map(option => ({ ...option, selected: selection.includes(option.id) }));
});

const canCreateLabelFromPicker = computed(() => {
  const name = pickerQuery.value.trim();
  if (popover.value?.kind !== 'detail-label-picker' || name === '') return false;
  return !labels.value.some(label => label.name === name);
});

/** 列菜单 / 卡片菜单的目标（模板里替代 Angular 的 `@if (...; as x)` 局部变量）。 */
const popoverColumn = computed(() =>
  popover.value?.kind === 'column-menu' ? columnById(popover.value.targetId) : undefined
);
const popoverTask = computed(() =>
  popover.value?.kind === 'task-menu' ? taskById(popover.value.targetId) : undefined
);

// 截止日镜像只跟随基线截止日的变化（见 detailDue 注释）
watch(
  () => detailBase.value?.dueDate ?? '',
  due => {
    detailDue.value = due;
  }
);

// ---------- 模板辅助 ----------

const inputValue = (event: Event): string =>
  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;

const labelsOf = (taskId: UUID): readonly BoardLabel[] => taskLabels.value.get(taskId) ?? [];

const tasksOf = (column: Column): readonly Task[] => taskMap.value.get(column.id) ?? [];

const visibleTasksOf = (column: Column): readonly Task[] => visibleTaskMap.value.get(column.id) ?? [];

const countLabel = (column: Column): string => {
  const visible = visibleTasksOf(column).length;
  return filterActive.value ? `筛选后 ${visible} / 共 ${tasksOf(column).length} 个任务` : `${visible} 个任务`;
};

const dueStatusOf = (dueDate: string | null): DueStatus | null => dueStatus(dueDate, today.value);

const overdueCount = (column: Column): number =>
  visibleTasksOf(column).filter(task => dueStatusOf(task.dueDate ?? null) === 'overdue').length;

const dueText = (dueDate: string): string => dueStatusText(dueDate, today.value);

const columnById = (columnId: UUID | null): Column | undefined => columns.value.find(column => column.id === columnId);

const taskById = (taskId: UUID | null): Task | undefined => tasks.value.find(task => task.id === taskId);

const columnTitleOf = (columnId: UUID | null): string => columnById(columnId)?.title ?? '';

const isFirstColumn = (column: Column): boolean => columns.value[0]?.id === column.id;

const isLastColumn = (column: Column): boolean => columns.value.at(-1)?.id === column.id;

const isPopoverFor = (kind: BoardPopoverKind, targetId: UUID): boolean =>
  popover.value?.kind === kind && popover.value.targetId === targetId;

const isLabelFiltered = (name: string): boolean => filteredLabelNames.value.includes(name.toLowerCase());

const popoverLabel = (pop: PopoverState): string => {
  if (pop.kind === 'board-menu') return '看板操作';
  if (pop.kind === 'column-menu') return `列操作：${columnTitleOf(pop.targetId)}`;
  if (pop.kind === 'task-menu') return `任务操作：${taskById(pop.targetId)?.title ?? ''}`;
  return pop.kind === 'detail-label-picker' ? '选择标签' : '移到列';
};

const sameColor = (a: string, b: string): boolean => a.toLowerCase() === b.trim().toLowerCase();

/** 预览色：输入未完成时沿用灰色，不把非法色交给对比度计算。 */
const previewColor = (color: string): string => (isHexColor(color) ? color.trim() : BOARD_LABEL_COLORS[0].color);

const canMoveTask = (task: Task, direction: BoardMoveDirection): boolean =>
  resolveKeyboardMove(keyboardColumns(), task.id, direction) !== null;

// ---------- 页头：板 ----------

const onBoardSelectionChange = (event: Event): void => {
  const selector = event.target as HTMLSelectElement;
  selectBoard(selector.value as UUID);
  selector.value = currentBoardId.value ?? '';
};

const openBoardComposer = (event?: Event): void => {
  boardComposerTitle.value = '';
  openDialog({ kind: 'board-composer' }, event);
};

/** 建板后切到新板；建板落库期间用户已自己切过板则尊重用户的选择。 */
const submitBoardComposer = async (): Promise<void> => {
  const title = boardComposerTitle.value.trim();
  if (title === '') return;
  const before = currentBoardId.value;
  const created = await guard(() => board.actions.createBoard({ title }));
  if (!created) return;
  closeDialog(false);
  if (currentBoardId.value === before) selectBoard(created.id);
};

const startBoardTitle = (): void => {
  boardTitleDraft.value = currentBoard.value?.title ?? '';
  editingBoardTitle.value = true;
  focusSoon('[data-testid="board-title-editor"]');
};

const commitBoardTitle = async (): Promise<void> => {
  const current = currentBoard.value;
  if (!editingBoardTitle.value || !current) return;
  editingBoardTitle.value = false;
  const title = boardTitleDraft.value;
  if (title.trim() === current.title) return;
  const saved = await guard(() => board.actions.updateBoard(current.id, { title }));
  if (saved === undefined) editingBoardTitle.value = true;
};

const cancelBoardTitle = (event: Event): void => {
  event.stopPropagation();
  editingBoardTitle.value = false;
};

const startBoardDescription = (): void => {
  boardDescriptionDraft.value = currentBoard.value?.description ?? '';
  editingBoardDescription.value = true;
  focusSoon('[data-testid="board-description-editor"]');
};

const commitBoardDescription = async (): Promise<void> => {
  const current = currentBoard.value;
  if (!editingBoardDescription.value || !current) return;
  editingBoardDescription.value = false;
  const description = boardDescriptionDraft.value.trim();
  if (description === (current.description ?? '')) return;
  await guard(() => board.actions.updateBoard(current.id, { description }));
};

const onBoardDescriptionKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    editingBoardDescription.value = false;
  }
  if (event.key === 'Enter' && isModifier(event)) void commitBoardDescription();
};

const openBoardMenu = (event: Event): void => {
  togglePopover('board-menu', null, event);
};

const openShortcuts = (): void => {
  closePopover(false);
  openDialog({ kind: 'shortcuts' });
};

/** 导出备份只受写门禁限制（空库也能导出）；回调由宿主经 `onExportBackup` 接线。 */
const exportBackup = async (): Promise<void> => {
  closePopover();
  const callback = props.onExportBackup;
  if (!callback) {
    showNotice('备份导出由宿主接线（US-537）');
    return;
  }
  await guard(async () => {
    await callback();
    showToast('备份已生成', false);
  });
};

const confirmBoardDelete = async (): Promise<void> => {
  const current = currentBoard.value;
  closePopover(false);
  if (!current) return;
  const plan = await guard(() => board.actions.planBoardDelete(current.id));
  if (plan) openDialog({ kind: 'confirm-delete', plan });
};

const undo = async (): Promise<void> => {
  await runHistory(() => board.actions.undo());
};

const redo = async (): Promise<void> => {
  await runHistory(() => board.actions.redo());
};

const runHistory = async (operation: () => Promise<void>): Promise<void> => {
  const done = await guard(async () => {
    await operation();
    return true;
  });
  if (done) await refreshDetail();
};

const undoFromToast = async (): Promise<void> => {
  toast.value = null;
  await undo();
};

// ---------- 筛选 ----------

/** 输入即筛；补全默认高亮第一项，回车直接采纳（GitHub 筛选条同款）。 */
const onFilterInput = (value: string): void => {
  filterQuery.value = value;
  suggestionsDismissed.value = false;
  activeSuggestion.value = 0;
};

const onFilterKeydown = (event: KeyboardEvent): void => {
  const count = suggestionsOpen.value ? suggestions.value.length : 0;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (count === 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const current = activeSuggestion.value;
    // 尚未选中时：↓ 到第一项、↑ 到最后一项
    const start = step > 0 ? -1 : count;
    activeSuggestion.value = ((current < 0 ? start : current) + step + count) % count;
    return;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const suggestion = suggestions.value[activeSuggestion.value];
    if (count === 0 || suggestion === undefined) return;
    event.preventDefault();
    applySuggestion(suggestion.query);
    return;
  }
  if (event.key === 'Escape') {
    event.stopPropagation();
    if (suggestionsOpen.value) suggestionsDismissed.value = true;
    else (event.target as HTMLInputElement).blur();
  }
};

const applySuggestion = (query: string): void => {
  onFilterInput(query);
  focusSoon('[data-testid="board-filter-input"]');
};

const clearFilter = (): void => {
  onFilterInput('');
};

/** 点击卡片上的标签即筛选（再次点击取消）。 */
const toggleLabelFilter = (name: string): void => {
  filterQuery.value = toggleBoardFilterValue(filterQuery.value, 'label', name);
  suggestionsDismissed.value = true;
};

// ---------- 列 ----------

const openColumnMenu = (event: Event, column: Column): void => {
  togglePopover('column-menu', column.id, event);
};

const startColumnTitle = (columnId: UUID): void => {
  closePopover(false);
  columnTitleDraft.value = columnTitleOf(columnId);
  editingColumnId.value = columnId;
  focusSoon('[data-testid="column-title-editor"]');
};

const commitColumnTitle = async (): Promise<void> => {
  const columnId = editingColumnId.value;
  if (columnId === null) return;
  editingColumnId.value = null;
  const title = columnTitleDraft.value;
  if (title.trim() === columnTitleOf(columnId)) return;
  const saved = await guard(() => board.actions.updateColumn(columnId, { title }));
  if (saved === undefined) editingColumnId.value = columnId;
};

const cancelColumnTitle = (event: Event): void => {
  event.stopPropagation();
  editingColumnId.value = null;
};

const sortColumnBy = async (columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> => {
  if (sortingColumnId.value !== null) return;
  closePopover(false);
  sortingColumnId.value = columnId;
  try {
    const result = await guard(() => board.actions.sortColumn(columnId, mode));
    if (!result) return;
    const label = mode === 'dueDate' ? '截止日' : '标题';
    showToast(
      result.written ? `已按${label}排序「${columnTitleOf(columnId)}」` : '已按目标顺序排列，无变化',
      result.written
    );
  } finally {
    sortingColumnId.value = null;
  }
};

const moveColumnBy = async (columnId: UUID, direction: -1 | 1): Promise<void> => {
  closePopover(false);
  const ids = columns.value.map(column => column.id);
  const index = ids.indexOf(columnId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
  const target =
    direction < 0 ?
      { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
    : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
  await guard(() => board.actions.moveColumn(columnId, target));
  focusSoon(`[data-column-header-id="${columnId}"] [data-testid="column-menu-trigger"]`);
};

const confirmColumnDelete = async (column: Column): Promise<void> => {
  closePopover(false);
  const plan = await guard(() => board.actions.planColumnDelete(column.id));
  if (plan) openDialog({ kind: 'confirm-delete', plan });
};

const openAddColumn = (): void => {
  addColumnTitle.value = '';
  addingColumn.value = true;
  focusSoon('[data-testid="column-composer-input"]');
};

const commitAddColumn = async (): Promise<void> => {
  const title = addColumnTitle.value.trim();
  if (title === '') return;
  const created = await guard(() => board.actions.createColumn({ title }));
  if (created === undefined) return;
  addingColumn.value = false;
  addColumnTitle.value = '';
};

const cancelAddColumn = (event?: Event): void => {
  event?.stopPropagation();
  addingColumn.value = false;
};

const openAddTask = (columnId: UUID): void => {
  if (creatingTask.value) return;
  addTaskColumnId.value = columnId;
  addTaskTitle.value = '';
  focusSoon('[data-testid="add-task-input"]');
};

const cancelAddTask = (event?: Event): void => {
  event?.stopPropagation();
  if (creatingTask.value) return;
  addTaskColumnId.value = null;
  addTaskTitle.value = '';
};

/** 列底建任务（GitHub 同款）：回车即建，输入框保持打开以便连续录入。 */
const commitAddTask = async (): Promise<void> => {
  const columnId = addTaskColumnId.value;
  const title = addTaskTitle.value.trim();
  if (creatingTask.value || columnId === null || title === '') return;
  creatingTask.value = true;
  try {
    const created = await guard(() => board.actions.createTask({ columnId, title }));
    if (created !== undefined) addTaskTitle.value = '';
  } finally {
    creatingTask.value = false;
  }
  focusSoon('[data-testid="add-task-input"]');
};

// ---------- 卡片 ----------

const openTaskMenu = (event: Event, task: Task): void => {
  togglePopover('task-menu', task.id, event);
};

const startTaskTitle = (task: Task): void => {
  closePopover(false);
  taskTitleDraft.value = task.title;
  editingTaskId.value = task.id;
  focusSoon('[data-testid="task-title-editor"]');
};

const commitTaskTitle = async (task: Task): Promise<void> => {
  const saved = await guard(() => board.actions.updateTaskTitle(task.id, taskTitleDraft.value));
  // 失败保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
  if (saved === undefined) return;
  editingTaskId.value = null;
  focusTaskSoon(task.id);
};

const cancelTaskTitle = (event?: Event): void => {
  event?.stopPropagation();
  const taskId = editingTaskId.value;
  editingTaskId.value = null;
  if (taskId !== null) focusTaskSoon(taskId);
};

const openMovePicker = (task: Task): void => {
  const anchor = popoverAnchor();
  popover.value = null;
  openPicker('move-picker', task.id, anchor, [task.columnId]);
};

const moveTaskBy = async (task: Task, direction: BoardMoveDirection): Promise<void> => {
  closePopover(false);
  const target = resolveKeyboardMove(keyboardColumns(), task.id, direction);
  if (target === null) return;
  if (await executeTaskMove(task.id, target)) focusTaskSoon(task.id);
};

const confirmTaskDelete = async (task: Task): Promise<void> => {
  closePopover(false);
  const plan = await guard(() => board.actions.planTaskDelete(task.id));
  if (plan) openDialog({ kind: 'confirm-delete', plan });
};

const onCardKeydown = (event: KeyboardEvent, task: Task): void => {
  if (event.target !== event.currentTarget || !runCardKey(event, task)) return;
  event.preventDefault();
  event.stopPropagation();
};

// ---------- 详情侧栏 ----------

const openDetail = async (taskId: UUID): Promise<void> => {
  closePopover(false);
  const request = ++detailRequest;
  pendingDetailTaskId = taskId;
  const currentActions = board.actions;
  const snapshot = await guard(() => currentActions.openSnapshot(taskId));
  if (request !== detailRequest || !snapshot) return;
  pendingDetailTaskId = null;
  detailSession = { taskId, actions: currentActions, base: snapshot };
  detailTaskId.value = taskId;
  focusedTaskId.value = taskId;
  applyDetailSnapshot(snapshot);
  detailStatus.value = null;
};

const closeDetail = (): void => {
  const taskId = detailTaskId.value;
  detailRequest++;
  detailSession = null;
  detailTaskId.value = null;
  detailBase.value = null;
  if (taskId !== null) focusTaskSoon(taskId);
};

const commitDetailTitle = (): Promise<void> => {
  const title = detailTitle.value;
  return enqueueDetail(async session => {
    if (title !== session.base.title) await saveDetailFields(session, { title });
  });
};
const revertDetailTitle = (event: Event): void => {
  event.stopPropagation();
  detailTitle.value = detailBase.value?.title ?? '';
};
const commitDetailDescription = (): Promise<void> => {
  const description = detailDescription.value;
  return enqueueDetail(async session => {
    if (description.trim() !== (session.base.description ?? '')) await saveDetailFields(session, { description });
  });
};
const onDetailDescriptionKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    detailDescription.value = detailBase.value?.description ?? '';
  }
  if (event.key === 'Enter' && isModifier(event)) void commitDetailDescription();
};
const commitDetailDue = (value: string): Promise<void> =>
  enqueueDetail(async session => {
    const dueDate = value === '' ? null : value;
    if (dueDate !== session.base.dueDate) await saveDetailFields(session, { dueDate });
  });

const openDetailColumnPicker = (event: Event): void => {
  const base = detailBase.value;
  if (!base || closeIfOpen('detail-column-picker')) return;
  openPicker('detail-column-picker', detailTaskId.value, anchorOf(event), [base.columnId], event);
};

const openDetailLabelPicker = (event: Event): void => {
  const base = detailBase.value;
  // 再点同一字段 = 关闭（并提交）：不能以未刷新的旧基线重开
  if (!base || closeIfOpen('detail-label-picker')) return;
  pickerLabelDraft = base.labelIds;
  openPicker('detail-label-picker', detailTaskId.value, anchorOf(event), base.labelIds, event);
};

const deleteDetailTask = async (event: Event): Promise<void> => {
  const task = taskById(detailTaskId.value);
  returnFocus = event.currentTarget as HTMLElement;
  if (task) await confirmTaskDelete(task);
};

// ---------- 选择器 ----------

const onPickerInput = (value: string): void => {
  pickerQuery.value = value;
  pickerActive.value = 0;
};

const onPickerKeydown = (event: KeyboardEvent): void => {
  const count = pickerOptions.value.length;
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    pickerActive.value = (pickerActive.value + step + count) % count;
    return;
  }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const option = pickerOptions.value[pickerActive.value];
  if (option) void choosePickerOption(option.id);
  else if (canCreateLabelFromPicker.value) void createLabelFromPicker();
};

const choosePickerOption = async (optionId: UUID): Promise<void> => {
  const pop = popover.value;
  if (!pop) return;
  if (pop.kind === 'detail-label-picker') {
    const selection = pickerSelection.value;
    pickerSelection.value =
      selection.includes(optionId) ? selection.filter(id => id !== optionId) : [...selection, optionId];
    return;
  }
  const fromDetail = pop.kind === 'detail-column-picker';
  closePopover(fromDetail);
  if (pop.targetId !== null) await moveTaskToColumn(pop.targetId, optionId, !fromDetail);
};

const createLabelFromPicker = async (): Promise<void> => {
  const name = pickerQuery.value.trim();
  const color = nextLabelColor(labels.value.map(label => label.color));
  const created = await guard(() => board.actions.createLabel({ name, color }));
  if (!created) return;
  pickerSelection.value = [...pickerSelection.value, created.id];
  onPickerInput('');
};

const onPopoverKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  closePopover();
};

// ---------- 对话框 ----------

const openLabels = (event?: Event): void => {
  labelEditor.value = null;
  openDialog({ kind: 'labels' }, event);
};

const openSearch = (event?: Event): void => {
  openDialog({ kind: 'search' }, event);
};

const closeDialog = (refocus = true): void => {
  const current = dialog.value;
  dialog.value = null;
  labelEditor.value = null;
  if (current?.kind === 'confirm-label-delete') {
    dialog.value = { kind: 'labels' };
    return;
  }
  if (refocus) restoreFocus();
};

const executeConfirmedDelete = async (): Promise<void> => {
  const current = dialog.value;
  if (current?.kind === 'confirm-label-delete') {
    dialog.value = { kind: 'labels' };
    // executeLabelDelete 返回 Promise<void>：成功也是 undefined，必须显式给出成功标记才能区分失败
    const deleted = await guard(async () => {
      await board.actions.executeLabelDelete(current.plan);
      return true;
    });
    if (deleted) showToast(`已删除标签「${current.plan.labelName}」`, true);
    return;
  }
  if (current?.kind !== 'confirm-delete') return;
  dialog.value = null;
  const plan = current.plan;
  const deleted = await guard(async () => {
    await board.actions.executeDelete(plan);
    return true;
  });
  if (!deleted) return;
  const removedIds = plan.kind === 'task' ? [plan.taskId] : plan.taskIds;
  // 正在加载的详情若属于被删集合，迟到的快照不得再打开侧栏
  if (pendingDetailTaskId !== null && removedIds.includes(pendingDetailTaskId)) detailRequest++;
  const openTaskId = detailTaskId.value;
  if (openTaskId !== null && removedIds.includes(openTaskId)) {
    detailRequest++;
    detailSession = null;
    detailTaskId.value = null;
    detailBase.value = null;
  }
  // 删掉的是当前板：查询词随句柄一起清空（只销毁句柄会留下旧词，再打开搜索框是一个失效的搜索态）
  if (plan.kind === 'board') onSearchInput('');
  showToast(deletedMessage(plan), true);
};

const startCreateLabel = (): void => {
  labelEditor.value = { labelId: null, name: '', color: nextLabelColor(labels.value.map(label => label.color)) };
  focusSoon('[data-testid="label-name-input"]');
};

const startEditLabel = (label: BoardLabel): void => {
  labelEditor.value = { labelId: label.id, name: label.name, color: label.color };
  focusSoon('[data-testid="label-name-input"]');
};

const updateLabelEditor = (patch: Partial<LabelEditorState>): void => {
  const editor = labelEditor.value;
  if (editor) labelEditor.value = { ...editor, ...patch };
};

const cancelLabelEditor = (): void => {
  labelEditor.value = null;
};

const saveLabelEditor = async (): Promise<void> => {
  const editor = labelEditor.value;
  if (!editor || editor.name.trim() === '' || !isHexColor(editor.color)) return;
  const saved = await guard(() => persistLabel(editor));
  if (saved !== undefined) labelEditor.value = null;
};

const deleteLabel = async (label: BoardLabel): Promise<void> => {
  const plan = await guard(() => board.actions.planLabelDelete(label.id));
  if (plan) dialog.value = { kind: 'confirm-label-delete', plan };
};

// ---------- 拖拽（只采集指针事件，落点由核心包换算） ----------

const onTaskDragStart = (event: DragEvent, task: Task): void => {
  event.dataTransfer?.setData('application/x-board-task', task.id);
  closePopover(false);
  dragging.value = { kind: 'task', id: task.id };
};

const onTaskDragOver = (event: DragEvent): void => {
  // 列头 handler 冒泡到这里，按拖拽类型分流，否则列拖拽的落点会被任务换算覆盖
  event.preventDefault();
  const current = dragging.value;
  const area = boardArea.value;
  if (current?.kind !== 'task' || !area) return;
  const target = resolveCardDrop(columnViews(area), current.id, event.clientX, event.clientY);
  if (target === null) {
    dropTarget.value = null;
    return;
  }
  // 插入线只画在看得见的卡片上（筛选隐藏的邻居退回可见邻居，两侧都隐藏则整列高亮）
  const visibleIds = (visibleTaskMap.value.get(target.columnId) ?? []).map(task => task.id);
  const anchor = dropIndicatorAnchor(target, visibleIds);
  dropTarget.value =
    anchor === null ?
      { kind: 'task-end', columnId: target.columnId }
    : { kind: 'task', columnId: target.columnId, ...anchor };
};

const onColumnDragStart = (event: DragEvent, column: Column): void => {
  event.dataTransfer?.setData('application/x-board-column', column.id);
  closePopover(false);
  dragging.value = { kind: 'column', id: column.id };
};

const onColumnDragOver = (event: DragEvent): void => {
  event.preventDefault();
  const current = dragging.value;
  if (current?.kind !== 'column') return;
  const target = resolveColumnTarget(current.id, event.clientX);
  const anchorId = target === null ? null : (target.prevId ?? target.nextId);
  dropTarget.value =
    target === null || anchorId === null ?
      null
    : { kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' };
};

const onTaskDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  const movedId = (event.dataTransfer?.getData('application/x-board-task') ||
    (dragging.value?.kind === 'task' ? dragging.value.id : undefined)) as UUID | undefined;
  // 列拖拽冒泡到这里时不清理拖拽态：根层的列落点还要用
  if (!movedId) return;
  const area = boardArea.value;
  clearDragFeedback();
  if (!area) return;
  const target = resolveCardDrop(columnViews(area), movedId, event.clientX, event.clientY);
  if (target) await executeTaskMove(movedId, target);
};

const onColumnDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault();
  const movedId = (event.dataTransfer?.getData('application/x-board-column') ||
    (dragging.value?.kind === 'column' ? dragging.value.id : undefined)) as UUID | undefined;
  clearDragFeedback();
  if (!movedId) return;
  const target = resolveColumnTarget(movedId, event.clientX);
  if (target) await guard(() => board.actions.moveColumn(movedId, target));
};

const clearDragFeedback = (): void => {
  dragging.value = null;
  dropTarget.value = null;
};

const isDropBefore = (task: Task): boolean => {
  const target = dropTarget.value;
  return target?.kind === 'task' && target.taskId === task.id && target.mode === 'before';
};

const isDropAfter = (task: Task): boolean => {
  const target = dropTarget.value;
  return target?.kind === 'task' && target.taskId === task.id && target.mode === 'after';
};

const isDropEnd = (column: Column): boolean => {
  const target = dropTarget.value;
  return target?.kind === 'task-end' && target.columnId === column.id;
};

const isDropColumn = (column: Column): boolean => {
  const target = dropTarget.value;
  return target !== null && target.kind !== 'column' && target.columnId === column.id;
};

const isColumnDropBefore = (column: Column): boolean => {
  const target = dropTarget.value;
  return target?.kind === 'column' && target.columnId === column.id && target.mode === 'before';
};

const isColumnDropAfter = (column: Column): boolean => {
  const target = dropTarget.value;
  return target?.kind === 'column' && target.columnId === column.id && target.mode === 'after';
};

const isDraggingTask = (task: Task): boolean => dragging.value?.kind === 'task' && dragging.value.id === task.id;

const isDraggingColumn = (column: Column): boolean =>
  dragging.value?.kind === 'column' && dragging.value.id === column.id;

// ---------- 搜索（US-539 阶段 B） ----------

/** 输入变化：空查询销毁句柄退出搜索态；否则复用同一句柄。 */
const onSearchInput = (value: string): void => {
  searchQuery.value = value;
  const query = value.trim();
  if (query === '') {
    destroySearch();
    return;
  }
  const source = board.searchSource;
  if (!source) return;
  if (searchHandle !== null) {
    searchHandle.setQuery(query);
    return;
  }
  const handle = source.search(query);
  searchHandle = handle;
  // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
  searchSubs.unsubscribe();
  searchSubs = new Subscription();
  searchSubs.add(handle.state$.subscribe(state => (searchState.value = state)));
  searchSubs.add(handle.results$.subscribe(results => (searchResults.value = results)));
  searchSubs.add(handle.hasMore$.subscribe(more => (searchHasMore.value = more)));
  searchSubs.add(handle.error$.subscribe(error => (searchErrorText.value = String(error))));
};

const onSearchMore = (): void => {
  if (searchState.value === 'loading') return;
  void searchHandle?.loadMore();
};

/** 点结果：关闭对话框、滚动到目标卡片、聚焦并短暂高亮（更新中不可点）。 */
const onSearchResultClick = (result: SearchResult): void => {
  if (searchState.value === 'loading') return;
  const targetId = result.id as UUID;
  closeDialog(false);
  boardArea.value
    ?.querySelector<HTMLElement>(`[data-task-id="${targetId}"]`)
    ?.scrollIntoView({ block: 'center', inline: 'center' });
  focusTaskSoon(targetId);
  searchHighlightId.value = targetId;
  if (highlightTimer !== null) window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    if (searchHighlightId.value === targetId) searchHighlightId.value = null;
  }, 2000);
};

const searchColumnTitle = (result: SearchResult): string =>
  columnTitleOf(taskById(result.id as UUID)?.columnId ?? null);

const searchResultTitle = (result: SearchResult): string => taskById(result.id as UUID)?.title ?? '';

const searchUnavailableText = (reason: BoardSearchUnavailableReason | null): string =>
  reason === 'plugin_not_installed' ? '搜索插件未安装'
  : reason === 'adapter_unsupported' ? '当前适配器不支持搜索'
  : reason === 'query_failed' ? '搜索查询失败'
  : '';

// ---------- 弹层 ----------

const closePopover = (refocus = true): void => {
  const pop = popover.value;
  if (!pop) return;
  popover.value = null;
  if (pop.kind === 'detail-label-picker') void commitPickerLabels();
  if (refocus) restoreFocus();
};

/** 该种弹层已打开则关闭并返回 true（触发器再点即关闭）。 */
const closeIfOpen = (kind: BoardPopoverKind): boolean => {
  if (popover.value?.kind !== kind) return false;
  closePopover();
  return true;
};

const togglePopover = (kind: BoardPopoverKind, targetId: UUID | null, event: Event): void => {
  if (popover.value?.kind === kind && popover.value.targetId === targetId) {
    closePopover();
    return;
  }
  closePopover(false);
  returnFocus = event.currentTarget as HTMLElement;
  popover.value = placedPopover(kind, targetId, anchorOf(event), 'end');
  focusSoon('.rxb-popover button:not(:disabled)');
};

const openPicker = (
  kind: BoardPopoverKind,
  targetId: UUID | null,
  anchor: DOMRect,
  selection: readonly UUID[],
  event?: Event
): void => {
  closePopover(false);
  if (event) returnFocus = event.currentTarget as HTMLElement;
  pickerQuery.value = '';
  pickerActive.value = 0;
  pickerSelection.value = selection;
  popover.value = placedPopover(kind, targetId, anchor, kind === 'move-picker' ? 'end' : 'start');
  focusSoon('[data-testid="picker-filter"]');
};

const placedPopover = (
  kind: BoardPopoverKind,
  targetId: UUID | null,
  anchor: DOMRect,
  align: 'start' | 'end'
): PopoverState => {
  const width = POPOVER_WIDTH[kind];
  const position = placePopover(
    anchor,
    { width, height: POPOVER_HEIGHT[kind] },
    { width: window.innerWidth, height: window.innerHeight },
    { align }
  );
  return { kind, targetId, width, ...position };
};

const anchorOf = (event: Event): DOMRect => (event.currentTarget as HTMLElement).getBoundingClientRect();

/** 当前菜单的位置作为子选择器的锚点（「移到列…」从卡片菜单展开）。 */
const popoverAnchor = (): DOMRect => {
  const pop = popover.value;
  return pop ? new DOMRect(pop.left + pop.width, pop.top, 0, 0) : new DOMRect();
};

const commitPickerLabels = async (): Promise<void> => {
  const selection = pickerSelection.value;
  const before = pickerLabelDraft;
  if (selection.length === before.length && selection.every(id => before.includes(id))) return;
  await enqueueDetail(session => saveDetailFields(session, { labelIds: selection }));
};

/** 移到目标列末尾（与 GitHub「Move to column」一致）；从详情侧栏发起时焦点留在侧栏。 */
const moveTaskToColumn = async (taskId: UUID, columnId: UUID, focusCard: boolean): Promise<void> => {
  const column = taskMap.value.get(columnId) ?? [];
  const target = resolveMenuMove(menuColumns(), taskId, columnId, column.length);
  if (target === null) return;
  if ((await executeTaskMove(taskId, target)) && focusCard) focusTaskSoon(taskId);
};

// ---------- 对话框 / 提示 ----------

const openDialog = (state: DialogState, event?: Event): void => {
  closePopover(false);
  if (event) returnFocus = event.currentTarget as HTMLElement;
  dialog.value = state;
  focusSoon('.rxb-dialog [data-autofocus]');
};

const restoreFocus = (): void => {
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected) target.focus();
};

const showNotice = (message: string): void => {
  notice.value = message;
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => (notice.value = null), 5000);
};

const showToast = (message: string, undoable: boolean): void => {
  toast.value = { message, undoable };
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.value = null), 6000);
};

const deletedMessage = (plan: DeletePlan): string => {
  if (plan.kind === 'task') return `已删除任务「${plan.taskTitle}」`;
  if (plan.kind === 'column') return `已删除列「${plan.columnTitle}」`;
  return `已删除看板「${plan.boardTitle}」`;
};

/** 新建或保存标签；编辑时只写改动的名称 / 颜色（标签已被删由领域入口报 label_not_found）。 */
const persistLabel = async (editor: LabelEditorState): Promise<true> => {
  const actions = board.actions;
  const color = editor.color.trim();
  if (editor.labelId === null) {
    await actions.createLabel({ name: editor.name, color });
    return true;
  }
  const label = labels.value.find(item => item.id === editor.labelId);
  if (label?.name !== editor.name.trim()) await actions.renameLabel(editor.labelId, editor.name);
  if (label === undefined || !sameColor(label.color, color)) await actions.recolorLabel(editor.labelId, color);
  return true;
};

// ---------- 详情保存队列 ----------

/** 详情字段的提交串行执行：回车后紧跟失焦等重复提交读到的是上一笔保存后的基线。 */
const enqueueDetail = (operation: (session: DetailSession) => Promise<unknown>): Promise<void> => {
  const session = detailSession;
  if (session === null) return Promise.resolve();
  const run = () => operation(session);
  const next = detailQueue.then(run, run);
  detailQueue = next.catch(() => undefined);
  return next.then(() => undefined);
};

const saveDetailFields = async (session: DetailSession, patch: TaskFieldPatch): Promise<void> => {
  if (session === detailSession) detailStatus.value = '保存中…';
  const result = await guard(() => session.actions.saveTaskFields(session.taskId, session.base, patch));
  if (result === undefined) {
    if (session === detailSession) detailStatus.value = null;
    return;
  }
  const fresh = await guard(() => session.actions.openSnapshot(session.taskId));
  if (fresh) session.base = fresh;
  if (session !== detailSession) return;
  if (!fresh) {
    detailStatus.value = null;
    return;
  }
  detailBase.value = fresh;
  if (patch.title !== undefined) detailTitle.value = fresh.title;
  if (patch.description !== undefined) detailDescription.value = fresh.description ?? '';
  if (patch.dueDate !== undefined) detailDue.value = fresh.dueDate ?? '';
  detailStatus.value = result.kind === 'saved' ? '已保存' : null;
};

/** 撤销 / 重做后重读详情：侧栏不显示旧值、下次编辑不被误判冲突；任务已不存在则关闭侧栏。 */
const refreshDetail = async (): Promise<void> => {
  const taskId = detailTaskId.value;
  if (taskId === null) return;
  try {
    const snapshot = await board.actions.openSnapshot(taskId);
    if (taskId === detailTaskId.value) applyDetailSnapshot(snapshot);
  } catch {
    if (taskId === detailTaskId.value) closeDetail();
  }
};

const applyDetailSnapshot = (snapshot: TaskDraftSnapshot): void => {
  if (detailSession !== null) detailSession.base = snapshot;
  detailBase.value = snapshot;
  detailTitle.value = snapshot.title;
  detailDescription.value = snapshot.description ?? '';
  detailDue.value = snapshot.dueDate ?? '';
};

// ---------- 键盘 ----------

const runCardKey = (event: KeyboardEvent, task: Task): boolean => {
  const move = event.altKey ? MOVE_KEYS[event.key] : undefined;
  if (move !== undefined) {
    void moveTaskBy(task, move);
    return true;
  }
  const direction = event.altKey ? undefined : FOCUS_KEYS[event.key];
  if (direction !== undefined) {
    const next = nextGridFocus(gridColumns(), task.id, direction);
    if (next !== null) focusTaskSoon(next);
    return true;
  }
  return runCardCommand(event, task);
};

const runCardCommand = (event: KeyboardEvent, task: Task): boolean => {
  if (event.key === 'Enter' || event.key === ' ') {
    void openDetail(task.id);
    return true;
  }
  if (event.key === 'F2') {
    startTaskTitle(task);
    return true;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    returnFocus = event.currentTarget as HTMLElement;
    void confirmTaskDelete(task);
    return true;
  }
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false;
  const card = event.currentTarget as HTMLElement;
  // 先关已开的弹层（标签选择器的草稿照常提交），再打开卡片菜单
  closePopover(false);
  returnFocus = card;
  popover.value = placedPopover('task-menu', task.id, card.getBoundingClientRect(), 'end');
  focusSoon('.rxb-popover button:not(:disabled)');
  return true;
};

/**
 * document 级按键：只在焦点位于看板内或 body 时生效。模态对话框打开时 Tab 只在对话框内循环
 * （首尾绕回，目标由核心包 `trapTabFocus` 换算）。
 */
const onDocumentKeydown = (event: KeyboardEvent): void => {
  const root = boardArea.value;
  const active = document.activeElement;
  const inside = active === null || active === document.body || (root?.contains(active) ?? false);
  if (!root || event.defaultPrevented || !inside) return;
  if (event.key === 'Escape') {
    if (handleEscape()) event.preventDefault();
    return;
  }
  if (event.key === 'Tab' && dialog.value !== null) {
    if (focusModalTab(root, event.shiftKey)) event.preventDefault();
    return;
  }
  if (isModifier(event) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (board.searchSource || board.searchUnavailableReason) openSearch();
    return;
  }
  if (isEditable(event.target) || dialog.value !== null) return;
  if (runGlobalShortcut(event)) event.preventDefault();
};

/** 单键与撤销快捷键（非编辑框内、无对话框时）；返回是否接管。 */
const runGlobalShortcut = (event: KeyboardEvent): boolean => {
  if (isModifier(event) && event.key.toLowerCase() === 'z') {
    void (event.shiftKey ? redo() : undo());
    return true;
  }
  if (isModifier(event) || event.altKey) return false;
  if (event.key === '?') {
    openShortcuts();
    return true;
  }
  if (event.key !== '/') return false;
  boardArea.value?.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')?.focus();
  return true;
};

/** Esc 由内向外：弹层 → 对话框 → 详情侧栏。 */
const handleEscape = (): boolean => {
  if (popover.value) {
    closePopover();
    return true;
  }
  if (dialog.value) {
    closeDialog();
    return true;
  }
  if (detailTaskId.value === null) return false;
  closeDetail();
  return true;
};

/**
 * 外部指针按下（捕获阶段）关闭弹层；本实例的弹层内与本实例展开中的触发器除外——
 * 同页另一个看板、宿主自己的展开控件（accordion / combobox）都算外部。
 */
const onDocumentPointerdown = (event: PointerEvent): void => {
  if (!popover.value) return;
  const hit = (event.target as Element | null)?.closest('.rxb-popover, [aria-expanded="true"]');
  if (hit && boardArea.value?.contains(hit)) return;
  closePopover(false);
};

const onViewportChange = (): void => {
  closePopover(false);
};

// ---------- 视图辅助 ----------

const gridColumns = (): { readonly columnId: UUID; readonly taskIds: readonly UUID[] }[] =>
  columns.value.map(column => ({
    columnId: column.id,
    taskIds: visibleTasksOf(column).map(task => task.id)
  }));

const menuColumns = (): { readonly columnId: UUID; readonly taskIds: readonly UUID[] }[] =>
  columns.value.map(column => ({
    columnId: column.id,
    taskIds: tasksOf(column).map(task => task.id)
  }));

const keyboardColumns = () =>
  columns.value.map(column => ({
    columnId: column.id,
    taskIds: tasksOf(column).map(task => task.id),
    visibleIds: visibleTasksOf(column).map(task => task.id)
  }));

const selectBoard = (boardId: UUID): void => {
  closePopover(false);
  detailRequest++;
  detailSession = null;
  detailTaskId.value = null;
  detailBase.value = null;
  board.selectBoard(boardId);
  // 切板销毁旧搜索句柄（setQuery 同词会被 distinctUntilChanged 吞掉，必须重建）
  const query = searchQuery.value.trim();
  destroySearch();
  if (query !== '') onSearchInput(query);
};

/**
 * 聚焦卡片并在约 1 秒内守住：提交与重渲染是异步的，卡片节点被移动 / 重建时焦点会掉回 body，
 * 掉回时补聚焦；用户已把焦点移到别处（如按 `/` 进筛选框）立即停止，不抢焦点。
 */
const focusTaskSoon = (taskId: UUID, attempts = 60, force = true): void => {
  const card = boardArea.value?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  const active = document.activeElement;
  const idle = active === null || active === document.body || active === card;
  if (!force && !idle) return;
  if (card && active !== card) card.focus();
  if (attempts > 0) requestAnimationFrame(() => focusTaskSoon(taskId, attempts - 1, false));
};

/**
 * 等目标渲染且可聚焦再聚焦（Vue 的 DOM 更新与活查询回流都是异步的；禁用中的输入框 focus 会静默失败），
 * 逐帧重试至多 30 帧。
 */
const focusSoon = (selector: string, attempts = 30): void => {
  const target = boardArea.value?.querySelector<HTMLElement>(selector);
  target?.focus();
  if (target && document.activeElement === target) return;
  if (attempts > 0) requestAnimationFrame(() => focusSoon(selector, attempts - 1));
};

const executeTaskMove = async (taskId: UUID, target: CardDropTarget): Promise<boolean> => {
  notice.value = null;
  try {
    await board.actions.moveTask(taskId, target);
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error));
    return false;
  }
  const base = detailBase.value;
  if (detailTaskId.value === taskId && base !== null) {
    const fresh = { ...base, columnId: target.columnId };
    if (detailSession !== null) detailSession.base = fresh;
    detailBase.value = fresh;
  }
  showToast(`已移动到「${columnTitleOf(target.columnId)}」`, true);
  return true;
};

const destroySearch = (): void => {
  searchSubs.unsubscribe();
  searchSubs = new Subscription();
  searchHandle?.destroy();
  searchHandle = null;
  searchState.value = 'idle';
  searchResults.value = [];
  searchHasMore.value = false;
  searchErrorText.value = null;
};

/** 拖拽几何：每次 dragover 现量：落点指示是伪元素 / 阴影、不触发重排，读的是干净布局；拖拽开始时缓存会在拖拽自动滚动后失效。 */
const columnViews = (area: HTMLElement): CardDropColumnView[] =>
  columns.value.map(column => {
    const rect = area.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`)?.getBoundingClientRect();
    // 几何只取可见卡片，邻居取完整序列（筛选隐藏的兄弟不被夹在两个邻居之间）
    const cards = visibleTasksOf(column).flatMap(task => {
      const cardRect = area.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)?.getBoundingClientRect();
      return cardRect ? [{ id: task.id, top: cardRect.top, bottom: cardRect.bottom }] : [];
    });
    return {
      columnId: column.id,
      rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
      cards,
      taskIds: tasksOf(column).map(task => task.id)
    };
  });

const resolveColumnTarget = (
  movedId: UUID,
  clientX: number
): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null => {
  const area = boardArea.value;
  const views = columns.value.map(column => {
    const rect = area?.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`)?.getBoundingClientRect();
    return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
  });
  return resolveColumnDrop(
    views,
    columns.value.map(column => column.id),
    movedId,
    clientX
  );
};

const guard = async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
  try {
    notice.value = null;
    return await operation();
  } catch (error) {
    showNotice(error instanceof Error ? error.message : String(error));
    return undefined;
  }
};

/** 恢复标记跨页同步：读 localStorage 标记并把门禁下发到领域桥。 */
const onBoardStorage = (): void => {
  board.setRestoring(typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null);
};

const onTodayActivity = (): void => {
  const now = new Date();
  today.value = localDateKey(now);
  if (todayTimer !== null) window.clearTimeout(todayTimer);
  todayTimer = window.setTimeout(onTodayActivity, msUntilNextLocalMidnight(now));
};

onMounted(() => {
  // 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
  window.addEventListener('storage', onBoardStorage);
  window.addEventListener('focus', onTodayActivity);
  window.addEventListener('resize', onViewportChange);
  document.addEventListener('visibilitychange', onTodayActivity);
  document.addEventListener('keydown', onDocumentKeydown);
  document.addEventListener('pointerdown', onDocumentPointerdown, true);
  onBoardStorage();
  onTodayActivity();
});

onBeforeUnmount(() => {
  detailRequest++;
  window.removeEventListener('storage', onBoardStorage);
  window.removeEventListener('focus', onTodayActivity);
  window.removeEventListener('resize', onViewportChange);
  document.removeEventListener('visibilitychange', onTodayActivity);
  document.removeEventListener('keydown', onDocumentKeydown);
  document.removeEventListener('pointerdown', onDocumentPointerdown, true);
  for (const timer of [todayTimer, noticeTimer, toastTimer, highlightTimer]) {
    if (timer !== null) window.clearTimeout(timer);
  }
  destroySearch();
});
</script>

<template>
  <section
    ref="board-area"
    class="rxb"
    :class="{ 'has-overlay': dialog !== null || detailTaskId !== null }"
    data-testid="board-view"
    @dragend="clearDragFeedback"
    @dragover="onTaskDragOver"
    @drop="onColumnDrop"
  >
    <!-- 页头：板切换 / 标题 / 描述 / 操作（GitHub Projects 项目头） -->
    <header
      class="rxb-header"
      data-testid="board-header"
    >
      <div class="rxb-header-main">
        <div class="rxb-board-switch">
          <select
            class="rxb-select"
            aria-label="选择看板"
            data-testid="board-selector"
            @change="onBoardSelectionChange"
          >
            <!-- 逐项绑 selected：新板的选项晚于当前板 id 渲染时，select 的 value 绑定会失配 -->
            <option
              v-for="item in boards"
              :key="item.id"
              :selected="item.id === currentBoardId"
              :value="item.id"
            >
              {{ item.title }}
            </option>
          </select>
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-invisible"
            :disabled="writeLocked"
            data-testid="create-board"
            @click="openBoardComposer"
          >
            <span
              class="rxb-i rxb-i-plus"
              aria-hidden="true"
            ></span>
            新建看板
          </button>
        </div>
        <template v-if="currentBoard">
          <h1 class="rxb-board-title">
            <input
              v-if="editingBoardTitle"
              class="rxb-input"
              :value="boardTitleDraft"
              aria-label="看板标题"
              data-autofocus
              data-testid="board-title-editor"
              @blur="commitBoardTitle"
              @input="boardTitleDraft = inputValue($event)"
              @keydown.enter="commitBoardTitle"
              @keydown.esc="cancelBoardTitle"
            />
            <button
              v-else
              class="rxb-title-button"
              :aria-label="`改板标题：${currentBoard.title}`"
              :disabled="writeLocked"
              data-testid="rename-board"
              @click="startBoardTitle"
            >
              {{ currentBoard.title }}
            </button>
          </h1>
          <div class="rxb-board-desc">
            <textarea
              v-if="editingBoardDescription"
              class="rxb-textarea"
              :value="boardDescriptionDraft"
              aria-label="看板描述"
              data-autofocus
              data-testid="board-description-editor"
              rows="2"
              @blur="commitBoardDescription"
              @input="boardDescriptionDraft = inputValue($event)"
              @keydown="onBoardDescriptionKeydown"
            ></textarea>
            <button
              v-else
              class="rxb-title-button"
              :disabled="writeLocked"
              data-testid="board-description"
              title="编辑看板描述"
              @click="startBoardDescription"
            >
              <template v-if="currentBoard.description">{{ currentBoard.description }}</template>
              <span
                v-else
                class="rxb-placeholder"
                >添加描述</span
              >
            </button>
          </div>
        </template>
      </div>
      <div class="rxb-header-actions">
        <span
          v-if="restoring"
          class="rxb-badge rxb-badge-attention"
          aria-live="polite"
          data-testid="restoring-badge"
          >恢复中</span
        >
        <div class="rxb-btn-group">
          <button
            class="rxb-btn rxb-btn-icon"
            :disabled="writeLocked || undoCount === 0"
            aria-label="撤销"
            data-testid="undo"
            title="撤销（⌘Z）"
            @click="undo"
          >
            <span
              class="rxb-i rxb-i-undo"
              aria-hidden="true"
            ></span>
          </button>
          <button
            class="rxb-btn rxb-btn-icon"
            :disabled="writeLocked || redoCount === 0"
            aria-label="重做"
            data-testid="redo"
            title="重做（⇧⌘Z）"
            @click="redo"
          >
            <span
              class="rxb-i rxb-i-redo"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <button
          v-if="board.searchSource || board.searchUnavailableReason"
          class="rxb-btn"
          data-testid="search-open"
          title="搜索任务（⌘K）"
          @click="openSearch"
        >
          <span
            class="rxb-i rxb-i-search"
            aria-hidden="true"
          ></span>
          搜索
        </button>
        <button
          class="rxb-btn"
          :disabled="!currentBoard"
          data-testid="labels-open"
          @click="openLabels"
        >
          <span
            class="rxb-i rxb-i-tag"
            aria-hidden="true"
          ></span>
          标签
        </button>
        <button
          class="rxb-btn rxb-btn-icon"
          :aria-expanded="popover?.kind === 'board-menu'"
          aria-haspopup="menu"
          aria-label="看板操作"
          data-testid="board-menu-trigger"
          @click="openBoardMenu"
        >
          <span
            class="rxb-i rxb-i-kebab"
            aria-hidden="true"
          ></span>
        </button>
      </div>
    </header>

    <!-- 筛选条（看板 v2 阶段 2）：关键词 + field:value 令牌，补全与命中数 -->
    <div
      v-if="currentBoard"
      class="rxb-toolbar"
    >
      <div
        class="rxb-filter"
        data-testid="board-filter"
      >
        <span
          class="rxb-i rxb-i-search"
          aria-hidden="true"
        ></span>
        <input
          class="rxb-filter-input"
          :aria-activedescendant="activeSuggestionId ?? undefined"
          :aria-controls="suggestionListId"
          :aria-expanded="suggestionsOpen"
          :value="filterQuery"
          aria-autocomplete="list"
          aria-label="筛选任务"
          autocomplete="off"
          data-testid="board-filter-input"
          placeholder="按关键词或字段筛选，如 label:核心 due:overdue"
          role="combobox"
          @blur="filterFocused = false"
          @focus="filterFocused = true"
          @input="onFilterInput(inputValue($event))"
          @keydown="onFilterKeydown"
        />
        <template v-if="filterActive">
          <span
            class="rxb-filter-count"
            aria-live="polite"
            data-testid="board-filter-count"
            >{{ visibleCount }} 项</span
          >
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
            aria-label="清除筛选"
            data-testid="board-filter-clear"
            @click="clearFilter"
          >
            <span
              class="rxb-i rxb-i-close"
              aria-hidden="true"
            ></span>
          </button>
        </template>
        <ul
          v-if="suggestionsOpen"
          :id="suggestionListId"
          class="rxb-popover"
          :style="{ left: '0px', position: 'absolute', top: 'calc(100% + 4px)' }"
          aria-label="筛选补全"
          data-testid="board-filter-suggestions"
          role="listbox"
        >
          <li
            v-for="(suggestion, index) in suggestions"
            :id="`${suggestionListId}-${index}`"
            :key="suggestion.query"
            class="rxb-menu-item rxb-suggestion"
            :class="{ 'is-active': index === activeSuggestion }"
            :aria-selected="index === activeSuggestion"
            data-testid="board-filter-suggestion"
            role="option"
            @mousedown.prevent
            @click="applySuggestion(suggestion.query)"
          >
            <span
              v-if="suggestion.color"
              class="rxb-swatch"
              :style="{ backgroundColor: suggestion.color }"
              aria-hidden="true"
            ></span>
            <span class="rxb-suggestion-value">{{ suggestion.value }}</span>
            <span class="rxb-suggestion-desc">{{ suggestion.description }}</span>
          </li>
        </ul>
      </div>
    </div>

    <p
      v-if="loading"
      class="rxb-banner"
      data-testid="board-loading"
      role="status"
    >
      <span>正在读取看板数据…</span>
    </p>
    <p
      v-else-if="readError"
      class="rxb-banner rxb-banner-danger"
      data-testid="board-read-error"
      role="alert"
    >
      <span>读取看板数据失败：{{ readError }}</span>
      <button
        class="rxb-btn rxb-btn-sm"
        data-testid="board-read-retry"
        @click="board.retryReads()"
      >
        重试
      </button>
    </p>
    <p
      v-if="restoring"
      class="rxb-banner rxb-banner-attention"
      data-testid="restoring-note"
    >
      <span>恢复进行中：浏览可用，写入口已暂停。</span>
    </p>
    <p
      v-if="notice"
      class="rxb-banner rxb-banner-danger"
      data-testid="board-notice"
      role="alert"
    >
      <span>{{ notice }}</span>
      <!-- 关提示不抢焦点：正在编辑的字段失焦会把刚被拒的草稿再提交一次 -->
      <button
        class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
        aria-label="关闭提示"
        data-testid="board-notice-close"
        @mousedown.prevent
        @click="notice = null"
      >
        <span
          class="rxb-i rxb-i-close"
          aria-hidden="true"
        ></span>
      </button>
    </p>

    <!-- 列区 -->
    <div
      v-if="currentBoard"
      class="rxb-columns"
      data-testid="columns"
      @scroll="closePopover(false)"
    >
      <section
        v-for="column in columns"
        :key="column.id"
        class="rxb-column"
        :class="{ 'is-drop-end': isDropEnd(column), 'is-drop-target': isDropColumn(column) }"
        :aria-label="`列：${column.title}`"
        :data-column-id="column.id"
        data-testid="column"
        @dragover="onColumnDragOver"
        @drop="onTaskDrop"
      >
        <header
          class="rxb-column-header"
          :class="{
            'is-dragging': isDraggingColumn(column),
            'is-drop-after': isColumnDropAfter(column),
            'is-drop-before': isColumnDropBefore(column)
          }"
          :data-column-header-id="column.id"
          :draggable="!writeLocked && editingColumnId !== column.id"
          data-testid="column-header"
          @dragstart="onColumnDragStart($event, column)"
        >
          <input
            v-if="editingColumnId === column.id"
            class="rxb-input"
            :value="columnTitleDraft"
            aria-label="列标题"
            data-autofocus
            data-testid="column-title-editor"
            @blur="commitColumnTitle"
            @input="columnTitleDraft = inputValue($event)"
            @keydown.enter="commitColumnTitle"
            @keydown.esc="cancelColumnTitle"
          />
          <template v-else>
            <h2
              class="rxb-column-title"
              data-testid="column-title"
            >
              {{ column.title }}
            </h2>
            <span
              class="rxb-counter"
              :title="countLabel(column)"
              data-testid="column-count"
              >{{ visibleTasksOf(column).length }}</span
            >
            <span
              v-if="overdueCount(column) > 0"
              class="rxb-column-overdue"
              data-testid="column-overdue"
              >逾期 {{ overdueCount(column) }}</span
            >
          </template>
          <div class="rxb-column-actions">
            <button
              class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
              :aria-expanded="isPopoverFor('column-menu', column.id)"
              :aria-label="`列操作：${column.title}`"
              aria-haspopup="menu"
              data-testid="column-menu-trigger"
              @click="openColumnMenu($event, column)"
            >
              <span
                class="rxb-i rxb-i-kebab"
                aria-hidden="true"
              ></span>
            </button>
            <button
              class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
              :aria-label="`添加任务到 ${column.title}`"
              :disabled="writeLocked"
              data-testid="column-add-task"
              @click="openAddTask(column.id)"
            >
              <span
                class="rxb-i rxb-i-plus"
                aria-hidden="true"
              ></span>
            </button>
          </div>
        </header>

        <div class="rxb-cards">
          <article
            v-for="task in visibleTasksOf(column)"
            :key="task.id"
            class="rxb-card"
            :class="{
              'is-dragging': isDraggingTask(task),
              'is-drop-after': isDropAfter(task),
              'is-drop-before': isDropBefore(task),
              'is-search-hit': searchHighlightId === task.id,
              'is-selected': detailTaskId === task.id
            }"
            :aria-label="`任务：${task.title}`"
            :data-task-id="task.id"
            :draggable="!writeLocked && editingTaskId !== task.id"
            :tabindex="rovingTaskId === task.id ? 0 : -1"
            data-testid="task-card"
            @dragstart="onTaskDragStart($event, task)"
            @focus="focusedTaskId = task.id"
            @keydown="onCardKeydown($event, task)"
          >
            <div
              v-if="editingTaskId === task.id"
              class="rxb-card-editor"
            >
              <input
                class="rxb-input"
                :value="taskTitleDraft"
                aria-label="任务标题"
                data-autofocus
                data-testid="task-title-editor"
                @input="taskTitleDraft = inputValue($event)"
                @keydown.enter="commitTaskTitle(task)"
                @keydown.esc="cancelTaskTitle"
              />
              <div class="rxb-composer-actions">
                <button
                  class="rxb-btn rxb-btn-sm"
                  aria-label="取消"
                  data-testid="task-title-cancel"
                  @click="cancelTaskTitle()"
                >
                  取消
                </button>
                <button
                  class="rxb-btn rxb-btn-sm rxb-btn-primary"
                  aria-label="保存标题"
                  data-testid="task-title-save"
                  @click="commitTaskTitle(task)"
                >
                  保存
                </button>
              </div>
            </div>
            <template v-else>
              <div class="rxb-card-main">
                <button
                  class="rxb-card-title"
                  data-testid="task-title"
                  tabindex="-1"
                  @click="openDetail(task.id)"
                >
                  {{ task.title }}
                </button>
                <button
                  class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible rxb-card-menu"
                  :aria-expanded="isPopoverFor('task-menu', task.id)"
                  :aria-label="`任务操作：${task.title}`"
                  aria-haspopup="menu"
                  data-testid="task-menu-trigger"
                  tabindex="-1"
                  @click="openTaskMenu($event, task)"
                >
                  <span
                    class="rxb-i rxb-i-kebab"
                    aria-hidden="true"
                  ></span>
                </button>
              </div>
              <div
                v-if="labelsOf(task.id).length > 0 || task.dueDate"
                class="rxb-card-fields"
              >
                <button
                  v-for="label in labelsOf(task.id)"
                  :key="label.id"
                  class="rxb-label"
                  :class="{ 'is-active': isLabelFiltered(label.name) }"
                  :style="{ backgroundColor: label.color, color: labelTextColor(label.color) }"
                  :aria-label="label.name"
                  :aria-pressed="isLabelFiltered(label.name)"
                  data-testid="card-label"
                  tabindex="-1"
                  title="按此标签筛选"
                  @click="toggleLabelFilter(label.name)"
                >
                  {{ label.name }}
                </button>
                <span
                  v-if="task.dueDate"
                  class="rxb-due"
                  :class="{
                    'is-overdue': dueStatusOf(task.dueDate) === 'overdue',
                    'is-today': dueStatusOf(task.dueDate) === 'today'
                  }"
                  data-testid="task-due"
                >
                  <span
                    class="rxb-i rxb-i-calendar"
                    aria-hidden="true"
                  ></span>
                  {{ dueText(task.dueDate) }}
                </span>
              </div>
            </template>
          </article>
          <p
            v-if="visibleTasksOf(column).length === 0"
            class="rxb-column-empty"
            data-testid="column-empty"
          >
            {{ filterActive && tasksOf(column).length > 0 ? '没有匹配筛选的任务' : '暂无任务' }}
          </p>
          <div
            v-if="addTaskColumnId === column.id"
            class="rxb-composer"
            data-testid="add-task-form"
          >
            <input
              class="rxb-input"
              :disabled="creatingTask"
              :value="addTaskTitle"
              aria-label="新任务标题"
              data-autofocus
              data-testid="add-task-input"
              placeholder="输入标题后回车创建"
              @input="addTaskTitle = inputValue($event)"
              @keydown.enter="commitAddTask"
              @keydown.esc="cancelAddTask"
            />
            <div class="rxb-composer-actions">
              <button
                class="rxb-btn rxb-btn-sm"
                :disabled="creatingTask"
                aria-label="取消"
                data-testid="add-task-cancel"
                @click="cancelAddTask()"
              >
                取消
              </button>
              <button
                class="rxb-btn rxb-btn-sm rxb-btn-primary"
                :disabled="creatingTask || addTaskTitle.trim() === ''"
                data-testid="add-task-submit"
                @click="commitAddTask"
              >
                添加
              </button>
            </div>
          </div>
          <button
            v-else
            class="rxb-add-item"
            :disabled="writeLocked || creatingTask"
            data-testid="add-task"
            @click="openAddTask(column.id)"
          >
            <span
              class="rxb-i rxb-i-plus"
              aria-hidden="true"
            ></span>
            添加任务
          </button>
        </div>
      </section>
      <div class="rxb-add-column">
        <div
          v-if="addingColumn"
          class="rxb-composer"
        >
          <input
            class="rxb-input"
            :value="addColumnTitle"
            aria-label="新列标题"
            data-autofocus
            data-testid="column-composer-input"
            placeholder="列名，如 In review"
            @input="addColumnTitle = inputValue($event)"
            @keydown.enter="commitAddColumn"
            @keydown.esc="cancelAddColumn"
          />
          <div class="rxb-composer-actions">
            <button
              class="rxb-btn rxb-btn-sm"
              data-testid="column-composer-cancel"
              @click="cancelAddColumn()"
            >
              取消
            </button>
            <button
              class="rxb-btn rxb-btn-sm rxb-btn-primary"
              :disabled="addColumnTitle.trim() === ''"
              data-testid="column-composer-submit"
              @click="commitAddColumn"
            >
              添加列
            </button>
          </div>
        </div>
        <button
          v-else
          class="rxb-btn"
          :disabled="writeLocked"
          data-testid="create-column"
          @click="openAddColumn"
        >
          <span
            class="rxb-i rxb-i-plus"
            aria-hidden="true"
          ></span>
          添加列
        </button>
      </div>
    </div>
    <div
      v-else-if="!loading && readError === null"
      class="rxb-empty"
      data-testid="empty-board"
    >
      <p class="rxb-empty-title">{{ boards.length === 0 ? '还没有看板' : '请选择看板' }}</p>
      <p>看板把任务按列组织；数据只保存在本地浏览器，可随时导出备份。</p>
      <button
        class="rxb-btn rxb-btn-primary"
        :disabled="writeLocked"
        data-testid="create-board-empty"
        @click="openBoardComposer"
      >
        新建看板
      </button>
    </div>

    <!-- 任务详情侧栏：叠加在看板之上，字段即改即存（每次改动一个可撤销事务） -->
    <section
      v-if="detailTaskId"
      class="rxb-panel"
      :aria-label="`任务详情：${detailTitle}`"
      data-testid="detail-panel"
      role="dialog"
    >
      <div class="rxb-panel-header">
        <span class="rxb-panel-kicker">
          {{ columnTitleOf(detailBase?.columnId ?? null) }}
          <template v-if="detailStatus">
            ·
            <span
              class="rxb-panel-status"
              aria-live="polite"
              data-testid="detail-status"
              >{{ detailStatus }}</span
            >
            <button
              v-if="detailStatus === '已保存'"
              class="rxb-link-button"
              :disabled="writeLocked || undoCount === 0"
              data-testid="detail-undo"
              @click="undo"
            >
              撤销
            </button>
          </template>
        </span>
        <button
          class="rxb-btn rxb-btn-icon rxb-btn-invisible"
          aria-label="关闭详情"
          data-testid="detail-close"
          @click="closeDetail"
        >
          <span
            class="rxb-i rxb-i-close"
            aria-hidden="true"
          ></span>
        </button>
      </div>
      <div class="rxb-panel-title">
        <input
          class="rxb-input"
          :disabled="writeLocked"
          :value="detailTitle"
          aria-label="标题"
          data-testid="detail-title"
          @blur="commitDetailTitle"
          @input="detailTitle = inputValue($event)"
          @keydown.enter="commitDetailTitle"
          @keydown.esc="revertDetailTitle"
        />
      </div>
      <div class="rxb-panel-body">
        <section class="rxb-panel-main">
          <label
            class="rxb-panel-section-title"
            :for="detailDescriptionId"
            >描述</label
          >
          <textarea
            :id="detailDescriptionId"
            class="rxb-textarea"
            :disabled="writeLocked"
            :value="detailDescription"
            data-testid="detail-description"
            placeholder="补充背景、验收标准或链接…"
            @blur="commitDetailDescription"
            @input="detailDescription = inputValue($event)"
            @keydown="onDetailDescriptionKeydown"
          ></textarea>
          <p class="rxb-hint">失焦或 ⌘Enter 保存，Esc 还原；每次保存都可撤销。</p>
        </section>
        <aside
          class="rxb-panel-fields"
          aria-label="字段"
        >
          <div class="rxb-field">
            <span class="rxb-field-label">所在列</span>
            <button
              class="rxb-field-value"
              :aria-expanded="popover?.kind === 'detail-column-picker'"
              :disabled="writeLocked"
              aria-haspopup="listbox"
              data-testid="detail-column"
              @click="openDetailColumnPicker"
            >
              {{ columnTitleOf(detailBase?.columnId ?? null) }}
              <span
                class="rxb-i rxb-i-chevron-down"
                aria-hidden="true"
              ></span>
            </button>
          </div>
          <div class="rxb-field">
            <span class="rxb-field-label">标签</span>
            <button
              class="rxb-field-value"
              :aria-expanded="popover?.kind === 'detail-label-picker'"
              :disabled="writeLocked"
              aria-haspopup="listbox"
              data-testid="detail-labels"
              @click="openDetailLabelPicker"
            >
              <span
                v-for="label in detailLabels"
                :key="label.id"
                class="rxb-label"
                :style="{ backgroundColor: label.color, color: labelTextColor(label.color) }"
                data-testid="detail-label"
                >{{ label.name }}</span
              >
              <span
                v-if="detailLabels.length === 0"
                class="rxb-placeholder"
                >无标签</span
              >
            </button>
          </div>
          <div class="rxb-field">
            <label
              class="rxb-field-label"
              :for="detailDueId"
              >截止日</label
            >
            <div class="rxb-field-row">
              <input
                :id="detailDueId"
                class="rxb-input"
                :disabled="writeLocked"
                :value="detailDue"
                data-testid="detail-due"
                type="date"
                @change="commitDetailDue(inputValue($event))"
                @input="detailDue = inputValue($event)"
              />
              <button
                v-if="detailBase?.dueDate"
                class="rxb-btn rxb-btn-icon rxb-btn-invisible"
                :disabled="writeLocked"
                aria-label="清除截止日"
                data-testid="detail-due-clear"
                @click="commitDetailDue('')"
              >
                <span
                  class="rxb-i rxb-i-close"
                  aria-hidden="true"
                ></span>
              </button>
            </div>
          </div>
          <div class="rxb-panel-actions">
            <button
              class="rxb-btn rxb-btn-danger"
              :disabled="writeLocked"
              data-testid="detail-delete"
              @click="deleteDetailTask"
            >
              <span
                class="rxb-i rxb-i-trash"
                aria-hidden="true"
              ></span>
              删除任务
            </button>
          </div>
        </aside>
      </div>
    </section>

    <!-- 弹层：菜单与选择器（根层 fixed 定位，避免被横向滚动的列区裁切） -->
    <div
      v-if="popover"
      class="rxb-popover"
      :style="{ left: `${popover.left}px`, top: `${popover.top}px`, width: `${popover.width}px` }"
      :aria-label="popoverLabel(popover)"
      :role="popover.kind.endsWith('picker') ? 'dialog' : 'menu'"
      data-testid="popover"
      @keydown="onPopoverKeydown"
    >
      <template v-if="popover.kind === 'board-menu'">
        <button
          class="rxb-menu-item"
          :disabled="writeLocked"
          data-testid="export-backup"
          role="menuitem"
          @click="exportBackup"
        >
          <span
            class="rxb-i rxb-i-download"
            aria-hidden="true"
          ></span>
          导出备份
        </button>
        <button
          class="rxb-menu-item"
          data-testid="shortcuts-open"
          role="menuitem"
          @click="openShortcuts"
        >
          <span
            class="rxb-i rxb-i-keyboard"
            aria-hidden="true"
          ></span>
          键盘快捷键
          <kbd class="rxb-kbd">?</kbd>
        </button>
        <div
          class="rxb-menu-divider"
          role="separator"
        ></div>
        <button
          class="rxb-menu-item rxb-menu-item-danger"
          :disabled="writeLocked || !currentBoard"
          data-testid="delete-board"
          role="menuitem"
          @click="confirmBoardDelete"
        >
          <span
            class="rxb-i rxb-i-trash"
            aria-hidden="true"
          ></span>
          删除看板
        </button>
      </template>
      <template v-else-if="popover.kind === 'column-menu'">
        <template v-if="popoverColumn">
          <div
            aria-label="列"
            role="group"
          >
            <p
              class="rxb-menu-heading"
              aria-hidden="true"
            >
              列
            </p>
            <button
              class="rxb-menu-item"
              :disabled="writeLocked"
              data-testid="column-rename"
              role="menuitem"
              @click="startColumnTitle(popoverColumn.id)"
            >
              <span
                class="rxb-i rxb-i-pencil"
                aria-hidden="true"
              ></span>
              改名
            </button>
            <button
              class="rxb-menu-item rxb-menu-item-danger"
              :disabled="writeLocked"
              data-testid="column-delete"
              role="menuitem"
              @click="confirmColumnDelete(popoverColumn)"
            >
              <span
                class="rxb-i rxb-i-trash"
                aria-hidden="true"
              ></span>
              删除列
            </button>
          </div>
          <div
            class="rxb-menu-divider"
            role="separator"
          ></div>
          <div
            aria-label="本列排序"
            role="group"
          >
            <p
              class="rxb-menu-heading"
              aria-hidden="true"
            >
              本列排序（一次性）
            </p>
            <button
              class="rxb-menu-item"
              :disabled="writeLocked || sortingColumnId !== null"
              data-testid="column-sort-due"
              role="menuitem"
              @click="sortColumnBy(popoverColumn.id, 'dueDate')"
            >
              <span
                class="rxb-i rxb-i-calendar"
                aria-hidden="true"
              ></span>
              按截止日
            </button>
            <button
              class="rxb-menu-item"
              :disabled="writeLocked || sortingColumnId !== null"
              data-testid="column-sort-title"
              role="menuitem"
              @click="sortColumnBy(popoverColumn.id, 'title')"
            >
              <span
                class="rxb-i rxb-i-sort"
                aria-hidden="true"
              ></span>
              按标题
            </button>
          </div>
          <div
            class="rxb-menu-divider"
            role="separator"
          ></div>
          <div
            aria-label="位置"
            role="group"
          >
            <p
              class="rxb-menu-heading"
              aria-hidden="true"
            >
              位置
            </p>
            <button
              class="rxb-menu-item"
              :disabled="writeLocked || isFirstColumn(popoverColumn)"
              data-testid="column-move-back"
              role="menuitem"
              @click="moveColumnBy(popoverColumn.id, -1)"
            >
              <span
                class="rxb-i rxb-i-arrow-left"
                aria-hidden="true"
              ></span>
              <span class="rxb-menu-item-label">
                左移
                <span
                  v-if="isFirstColumn(popoverColumn)"
                  class="rxb-menu-item-hint"
                  >已是最左列</span
                >
              </span>
            </button>
            <button
              class="rxb-menu-item"
              :disabled="writeLocked || isLastColumn(popoverColumn)"
              data-testid="column-move-forward"
              role="menuitem"
              @click="moveColumnBy(popoverColumn.id, 1)"
            >
              <span
                class="rxb-i rxb-i-arrow-right"
                aria-hidden="true"
              ></span>
              <span class="rxb-menu-item-label">
                右移
                <span
                  v-if="isLastColumn(popoverColumn)"
                  class="rxb-menu-item-hint"
                  >已是最右列</span
                >
              </span>
            </button>
          </div>
        </template>
      </template>
      <template v-else-if="popover.kind === 'task-menu'">
        <template v-if="popoverTask">
          <button
            class="rxb-menu-item"
            data-testid="task-menu-open"
            role="menuitem"
            @click="openDetail(popoverTask.id)"
          >
            <span
              class="rxb-i rxb-i-open"
              aria-hidden="true"
            ></span>
            打开详情
            <kbd class="rxb-kbd">↵</kbd>
          </button>
          <button
            class="rxb-menu-item"
            :disabled="writeLocked"
            data-testid="task-edit-title"
            role="menuitem"
            @click="startTaskTitle(popoverTask)"
          >
            <span
              class="rxb-i rxb-i-pencil"
              aria-hidden="true"
            ></span>
            编辑标题
            <kbd class="rxb-kbd">F2</kbd>
          </button>
          <div
            class="rxb-menu-divider"
            role="separator"
          ></div>
          <button
            class="rxb-menu-item"
            :disabled="writeLocked"
            aria-haspopup="listbox"
            data-testid="task-move-to-column"
            role="menuitem"
            @click="openMovePicker(popoverTask)"
          >
            <span
              class="rxb-i rxb-i-arrow-right"
              aria-hidden="true"
            ></span>
            移到列…
            <span
              class="rxb-i rxb-i-chevron-right"
              aria-hidden="true"
            ></span>
          </button>
          <button
            class="rxb-menu-item"
            :disabled="writeLocked || !canMoveTask(popoverTask, 'up')"
            data-testid="task-move-up"
            role="menuitem"
            @click="moveTaskBy(popoverTask, 'up')"
          >
            <span
              class="rxb-i rxb-i-arrow-up"
              aria-hidden="true"
            ></span>
            上移
            <kbd class="rxb-kbd">⌥↑</kbd>
          </button>
          <button
            class="rxb-menu-item"
            :disabled="writeLocked || !canMoveTask(popoverTask, 'down')"
            data-testid="task-move-down"
            role="menuitem"
            @click="moveTaskBy(popoverTask, 'down')"
          >
            <span
              class="rxb-i rxb-i-arrow-down"
              aria-hidden="true"
            ></span>
            下移
            <kbd class="rxb-kbd">⌥↓</kbd>
          </button>
          <div
            class="rxb-menu-divider"
            role="separator"
          ></div>
          <button
            class="rxb-menu-item rxb-menu-item-danger"
            :disabled="writeLocked"
            data-testid="task-delete"
            role="menuitem"
            @click="confirmTaskDelete(popoverTask)"
          >
            <span
              class="rxb-i rxb-i-trash"
              aria-hidden="true"
            ></span>
            删除任务
            <kbd class="rxb-kbd">Del</kbd>
          </button>
        </template>
      </template>
      <template v-else>
        <p class="rxb-picker-title">{{ popover.kind === 'detail-label-picker' ? '选择标签' : '移到列' }}</p>
        <div class="rxb-picker-filter">
          <input
            class="rxb-input"
            :value="pickerQuery"
            aria-label="过滤选项"
            data-autofocus
            data-testid="picker-filter"
            placeholder="过滤选项"
            @input="onPickerInput(inputValue($event))"
            @keydown="onPickerKeydown"
          />
        </div>
        <!-- listbox 只容 option：空态段落放在 listbox 之外 -->
        <div
          v-if="pickerOptions.length > 0"
          :aria-label="popover.kind === 'detail-label-picker' ? '选择标签' : '移到列'"
          :aria-multiselectable="popover.kind === 'detail-label-picker'"
          role="listbox"
        >
          <button
            v-for="(option, index) in pickerOptions"
            :key="option.id"
            class="rxb-menu-item"
            :class="{ 'is-active': index === pickerActive }"
            :aria-selected="option.selected"
            data-testid="picker-option"
            role="option"
            @click="choosePickerOption(option.id)"
          >
            <span class="rxb-picker-check">
              <span
                v-if="option.selected"
                class="rxb-i rxb-i-check"
                aria-hidden="true"
              ></span>
            </span>
            <span
              v-if="option.color"
              class="rxb-swatch"
              :style="{ backgroundColor: option.color }"
              aria-hidden="true"
            ></span>
            {{ option.label }}
          </button>
        </div>
        <p
          v-else
          class="rxb-picker-empty"
        >
          没有匹配的选项
        </p>
        <template v-if="canCreateLabelFromPicker">
          <div
            class="rxb-menu-divider"
            role="separator"
          ></div>
          <button
            class="rxb-menu-item"
            data-testid="picker-create"
            @click="createLabelFromPicker"
          >
            <span
              class="rxb-i rxb-i-plus"
              aria-hidden="true"
            ></span>
            创建标签「{{ pickerQuery.trim() }}」
          </button>
        </template>
      </template>
    </div>

    <!-- 模态对话框 -->
    <div
      v-if="dialog"
      class="rxb-dialog-backdrop"
      data-testid="dialog-backdrop"
      @mousedown.self="closeDialog()"
    >
      <div
        v-if="dialog.kind === 'confirm-delete'"
        class="rxb-dialog"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="confirm-delete"
        role="alertdialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            确认删除
          </h2>
        </div>
        <div class="rxb-dialog-body">
          <template v-if="dialog.plan.kind === 'task'">
            <p>删除任务「{{ dialog.plan.taskTitle }}」？</p>
            <div class="rxb-impact">
              <span>将同时移除 {{ dialog.plan.taskLabelIds.length }} 条标签关联。</span>
            </div>
          </template>
          <template v-else-if="dialog.plan.kind === 'column'">
            <p>删除列「{{ dialog.plan.columnTitle }}」？</p>
            <div class="rxb-impact">
              <span>其中 {{ dialog.plan.taskIds.length }} 个任务会一并删除；</span>
              <span>{{ dialog.plan.taskLabelIds.length }} 条任务标签关联随之移除，板级标签定义保留。</span>
            </div>
          </template>
          <template v-else>
            <p>删除看板「{{ dialog.plan.boardTitle }}」？</p>
            <div class="rxb-impact">
              <span>
                {{ dialog.plan.columnIds.length }} 列、{{ dialog.plan.taskIds.length }} 个任务、{{
                  dialog.plan.boardLabelIds.length
                }}
                个标签定义、{{ dialog.plan.taskLabelIds.length }} 条任务标签关联会一并删除。
              </span>
            </div>
          </template>
          <p class="rxb-hint">删除后可用「撤销」恢复（仅限本次会话）。</p>
        </div>
        <div class="rxb-dialog-footer">
          <button
            class="rxb-btn"
            data-autofocus
            data-testid="confirm-delete-no"
            @click="closeDialog()"
          >
            取消
          </button>
          <button
            class="rxb-btn rxb-btn-danger"
            data-testid="confirm-delete-yes"
            @click="executeConfirmedDelete"
          >
            确认删除
          </button>
        </div>
      </div>
      <div
        v-else-if="dialog.kind === 'confirm-label-delete'"
        class="rxb-dialog"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="confirm-delete"
        role="alertdialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            删除标签
          </h2>
        </div>
        <div class="rxb-dialog-body">
          <p>删除标签「{{ dialog.plan.labelName }}」？</p>
          <div class="rxb-impact">
            <span>将从 {{ dialog.plan.taskLabelIds.length }} 个任务上移除这个标签。</span>
          </div>
          <p class="rxb-hint">删除后可用「撤销」恢复（仅限本次会话）。</p>
        </div>
        <div class="rxb-dialog-footer">
          <button
            class="rxb-btn"
            data-autofocus
            data-testid="confirm-delete-no"
            @click="closeDialog()"
          >
            取消
          </button>
          <button
            class="rxb-btn rxb-btn-danger"
            data-testid="confirm-delete-yes"
            @click="executeConfirmedDelete"
          >
            确认删除
          </button>
        </div>
      </div>
      <div
        v-else-if="dialog.kind === 'board-composer'"
        class="rxb-dialog"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="board-composer"
        role="dialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            新建看板
          </h2>
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
            aria-label="关闭"
            data-testid="dialog-close"
            @click="closeDialog()"
          >
            <span
              class="rxb-i rxb-i-close"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <div class="rxb-dialog-body">
          <label class="rxb-form-field">
            看板名称
            <input
              class="rxb-input"
              :value="boardComposerTitle"
              data-autofocus
              data-testid="board-composer-input"
              placeholder="如：2026 Q4 发布计划"
              @input="boardComposerTitle = inputValue($event)"
              @keydown.enter="submitBoardComposer"
            />
          </label>
        </div>
        <div class="rxb-dialog-footer">
          <button
            class="rxb-btn"
            @click="closeDialog()"
          >
            取消
          </button>
          <button
            class="rxb-btn rxb-btn-primary"
            :disabled="boardComposerTitle.trim() === ''"
            data-testid="board-composer-submit"
            @click="submitBoardComposer"
          >
            创建
          </button>
        </div>
      </div>
      <div
        v-else-if="dialog.kind === 'labels'"
        class="rxb-dialog"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="label-manager"
        role="dialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            {{
              labelEditor === null ? '标签'
              : labelEditor.labelId === null ? '新建标签'
              : '编辑标签'
            }}
          </h2>
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
            aria-label="关闭"
            data-testid="dialog-close"
            @click="closeDialog()"
          >
            <span
              class="rxb-i rxb-i-close"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <template v-if="labelEditor">
          <div
            class="rxb-dialog-body"
            data-testid="label-editor"
          >
            <div class="rxb-label-preview">
              <span
                class="rxb-label"
                :style="{
                  backgroundColor: previewColor(labelEditor.color),
                  color: labelTextColor(previewColor(labelEditor.color))
                }"
                >{{ labelEditor.name.trim() || '标签预览' }}</span
              >
            </div>
            <label class="rxb-form-field">
              名称
              <input
                class="rxb-input"
                :value="labelEditor.name"
                data-autofocus
                data-testid="label-name-input"
                @input="updateLabelEditor({ name: inputValue($event) })"
                @keydown.enter="saveLabelEditor"
              />
            </label>
            <div
              class="rxb-form-field"
              aria-label="颜色"
              role="group"
            >
              颜色
              <div class="rxb-swatches">
                <button
                  v-for="option in labelColors"
                  :key="option.color"
                  class="rxb-swatch-button"
                  :style="{ backgroundColor: option.color }"
                  :aria-label="option.name"
                  :aria-pressed="sameColor(option.color, labelEditor.color)"
                  data-testid="label-color-option"
                  @click="updateLabelEditor({ color: option.color })"
                >
                  <span
                    v-if="sameColor(option.color, labelEditor.color)"
                    class="rxb-i rxb-i-check"
                    :style="{ color: labelTextColor(option.color) }"
                    aria-hidden="true"
                  ></span>
                </button>
              </div>
              <div class="rxb-color-row">
                <span class="rxb-hint">自定义</span>
                <input
                  class="rxb-input"
                  :value="labelEditor.color"
                  aria-label="自定义颜色（#rrggbb）"
                  data-testid="label-color-input"
                  maxlength="7"
                  @input="updateLabelEditor({ color: inputValue($event) })"
                />
              </div>
            </div>
          </div>
          <div class="rxb-dialog-footer">
            <button
              class="rxb-btn"
              data-testid="label-editor-cancel"
              @click="cancelLabelEditor"
            >
              取消
            </button>
            <button
              class="rxb-btn rxb-btn-primary"
              :disabled="labelEditor.name.trim() === '' || !isHexColor(labelEditor.color)"
              data-testid="label-editor-save"
              @click="saveLabelEditor"
            >
              保存
            </button>
          </div>
        </template>
        <template v-else>
          <div class="rxb-dialog-body">
            <p
              v-if="labels.length === 0"
              class="rxb-hint"
            >
              当前看板还没有标签。
            </p>
            <ul class="rxb-label-list">
              <li
                v-for="label in labels"
                :key="label.id"
                class="rxb-label-row"
                data-testid="label-row"
              >
                <span
                  class="rxb-label"
                  :style="{ backgroundColor: label.color, color: labelTextColor(label.color) }"
                  data-testid="label-chip"
                  >{{ label.name }}</span
                >
                <button
                  class="rxb-btn rxb-btn-sm"
                  :aria-label="`编辑标签 ${label.name}`"
                  :disabled="writeLocked"
                  data-testid="label-edit"
                  @click="startEditLabel(label)"
                >
                  编辑
                </button>
                <button
                  class="rxb-btn rxb-btn-sm rxb-btn-danger"
                  :aria-label="`删除标签 ${label.name}`"
                  :disabled="writeLocked"
                  data-testid="label-delete"
                  @click="deleteLabel(label)"
                >
                  删除
                </button>
              </li>
            </ul>
          </div>
          <div class="rxb-dialog-footer">
            <button
              class="rxb-btn rxb-btn-primary"
              :disabled="writeLocked"
              data-autofocus
              data-testid="create-label"
              @click="startCreateLabel"
            >
              <span
                class="rxb-i rxb-i-plus"
                aria-hidden="true"
              ></span>
              新建标签
            </button>
          </div>
        </template>
      </div>
      <div
        v-else-if="dialog.kind === 'search'"
        class="rxb-dialog rxb-dialog-wide"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="board-search"
        role="dialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            搜索当前板任务
          </h2>
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
            aria-label="关闭"
            data-testid="dialog-close"
            @click="closeDialog()"
          >
            <span
              class="rxb-i rxb-i-close"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <div class="rxb-dialog-body">
          <input
            class="rxb-input"
            :disabled="!board.searchSource"
            :placeholder="
              board.searchSource ? '全文搜索标题与描述' : searchUnavailableText(board.searchUnavailableReason)
            "
            :value="searchQuery"
            aria-label="搜索当前板任务"
            data-autofocus
            data-testid="board-search-input"
            @input="onSearchInput(inputValue($event))"
          />
          <p
            v-if="!board.searchSource"
            class="rxb-hint"
            data-testid="board-search-unavailable"
          >
            {{ searchUnavailableText(board.searchUnavailableReason) }}
          </p>
          <div
            v-if="searchQuery.trim() !== ''"
            class="rxb-search-results"
            data-testid="board-search-results"
          >
            <p
              v-if="searchState === 'loading'"
              class="rxb-hint"
              data-testid="board-search-loading"
            >
              搜索中…
            </p>
            <p
              v-else-if="searchState === 'error'"
              class="rxb-hint"
              data-testid="board-search-error"
            >
              {{ searchErrorText }}
            </p>
            <p
              v-else-if="searchState === 'empty'"
              class="rxb-hint"
              data-testid="board-search-empty"
            >
              无匹配
            </p>
            <template v-else>
              <button
                v-for="result in searchResults"
                :key="result.id"
                class="rxb-search-result"
                data-testid="board-search-result"
                @click="onSearchResultClick(result)"
              >
                <span class="rxb-search-result-title">{{ searchResultTitle(result) }}</span>
                <span class="rxb-search-result-column">{{ searchColumnTitle(result) }}</span>
                <span class="rxb-search-result-snippet">{{ result.snippet }}</span>
              </button>
              <button
                v-if="searchHasMore"
                class="rxb-btn rxb-btn-sm"
                data-testid="board-search-more"
                @click="onSearchMore"
              >
                加载更多
              </button>
            </template>
          </div>
        </div>
      </div>
      <div
        v-else
        class="rxb-dialog rxb-dialog-wide"
        :aria-labelledby="dialogTitleId"
        aria-modal="true"
        data-testid="shortcuts-dialog"
        role="dialog"
      >
        <div class="rxb-dialog-header">
          <h2
            :id="dialogTitleId"
            class="rxb-dialog-title"
          >
            键盘快捷键
          </h2>
          <button
            class="rxb-btn rxb-btn-sm rxb-btn-icon rxb-btn-invisible"
            aria-label="关闭"
            data-autofocus
            data-testid="dialog-close"
            @click="closeDialog()"
          >
            <span
              class="rxb-i rxb-i-close"
              aria-hidden="true"
            ></span>
          </button>
        </div>
        <div class="rxb-dialog-body">
          <div class="rxb-shortcuts">
            <section
              v-for="group in shortcutGroups"
              :key="group.title"
              class="rxb-shortcut-group"
            >
              <h3 class="rxb-panel-section-title">{{ group.title }}</h3>
              <div
                v-for="item in group.items"
                :key="item.label"
                class="rxb-shortcut"
              >
                <span>{{ item.label }}</span>
                <span>
                  <kbd
                    v-for="keyLabel in item.keys"
                    :key="keyLabel"
                    class="rxb-kbd"
                    >{{ keyLabel }}</kbd
                  >
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="toast"
      class="rxb-toast"
      aria-live="polite"
      data-testid="board-toast"
      role="status"
    >
      <span>{{ toast.message }}</span>
      <button
        v-if="toast.undoable"
        class="rxb-btn rxb-btn-sm rxb-toast-undo"
        :disabled="writeLocked || undoCount === 0"
        data-testid="board-toast-undo"
        @click="undoFromToast"
      >
        撤销
      </button>
      <button
        class="rxb-btn rxb-btn-sm rxb-btn-icon"
        aria-label="关闭提示"
        data-testid="board-toast-close"
        @click="toast = null"
      >
        <span
          class="rxb-i rxb-i-close"
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </section>
</template>

<style>
/*
 * 三端共用的看板样式（非 scoped）：构建时内联进发布包的 board-view.css，开发期由 Vite 注入。
 * 用 CSS @import 而非 <style src>：后者会生成 JS 侧的样式 import，被库构建的 /^@aiao\// external 规则
 * 原样外置（产物里留下消费方解析不了的 `board.css?vue&type=style` 引用，board-view.css 也不再产出）；
 * @import 由 Vite 的 CSS 管线自行解析内联，不经过 external。
 */
@import '@aiao/rxdb-plugin-board/board.css';
</style>
