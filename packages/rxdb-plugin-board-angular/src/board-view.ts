import type { UUID } from '@aiao/rxdb';
import {
  BOARD_LABEL_COLORS,
  dropIndicatorAnchor,
  dueStatus,
  dueStatusText,
  focusModalTab,
  isBoardFilterEmpty,
  isHexColor,
  localDateKey,
  matchesBoardFilter,
  msUntilNextLocalMidnight,
  nextGridFocus,
  nextLabelColor,
  parseBoardFilter,
  labelTextColor as pickLabelTextColor,
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
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  OnInit,
  runInInjectionContext,
  signal,
  viewChild
} from '@angular/core';
import { Subscription } from 'rxjs';

import { useBoard, type UseBoardReturn } from './use-board.js';

/** 弹层种类：菜单（板 / 列 / 卡片）与选择器（移到列 / 详情所在列 / 详情标签）。 */
export type BoardPopoverKind =
  'board-menu' | 'column-menu' | 'task-menu' | 'move-picker' | 'detail-column-picker' | 'detail-label-picker';

interface DetailSession {
  readonly taskId: UUID;
  readonly actions: UseBoardReturn['actions'];
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

let instanceCounter = 0;

/**
 * 看板视图组件（看板 v2，GitHub Projects 风格）：页头 + 筛选条 + 列 / 卡片 + 叠加详情侧栏 +
 * 根层菜单 / 选择器 + 模态对话框 + 带撤销的操作提示。
 *
 * @remarks
 * 动作收进上下文菜单、就地编辑即改即存（每次改动一个可撤销事务）、一个选择器与一套筛选语法走天下。
 * 三端只采集指针 / 键盘事件，落点、键盘目标、筛选与弹层定位都调用核心包同一份纯函数；
 * 全部写入口经 {@link useBoard} 的领域动作（恢复中写门禁与校验在服务层复核，不靠隐藏按钮）。
 * 样式来自 `@aiao/rxdb-plugin-board/board.css`，Angular 宿主需在全局样式中引入。
 */
@Component({
  selector: 'board-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-view.html'
})
export class BoardViewComponent implements OnInit, OnDestroy {
  private readonly injectorRef = inject(Injector);
  private readonly uid = ++instanceCounter;

  private noticeTimer: number | null = null;
  private toastTimer: number | null = null;
  private todayTimer: number | null = null;
  private searchHandle: SearchHandle | null = null;
  private searchSubs = new Subscription();
  private detailRequest = 0;
  private pendingDetailTaskId: UUID | null = null;
  private detailQueue: Promise<unknown> = Promise.resolve();
  private detailSession: DetailSession | null = null;
  private returnFocus: HTMLElement | null = null;
  private pickerLabelDraft: readonly UUID[] = [];
  private readonly pickerSelection = signal<readonly UUID[]>([]);
  private readonly suggestionsDismissed = signal(false);

  private readonly filteredLabelNames = computed(() =>
    this.filter()
      .terms.filter(term => term.field === 'label' && !term.negated)
      .flatMap(term => term.values.map(value => value.toLowerCase()))
  );

  protected readonly board = signal<UseBoardReturn | null>(null);
  protected readonly boardArea = viewChild<ElementRef<HTMLElement>>('boardArea');
  protected readonly today = signal(localDateKey(new Date()));
  protected readonly notice = signal<string | null>(null);
  protected readonly toast = signal<{ readonly message: string; readonly undoable: boolean } | null>(null);
  protected readonly popover = signal<PopoverState | null>(null);
  protected readonly dialog = signal<DialogState | null>(null);

  protected readonly suggestionListId = `rxb-${this.uid}-suggestions`;
  protected readonly dialogTitleId = `rxb-${this.uid}-dialog-title`;
  protected readonly detailDescriptionId = `rxb-${this.uid}-description`;
  protected readonly detailDueId = `rxb-${this.uid}-due`;
  protected readonly labelColors = BOARD_LABEL_COLORS;
  protected readonly shortcutGroups = SHORTCUT_GROUPS;

  // ---------- 拖拽 ----------
  protected readonly dragging = signal<{ readonly kind: 'task' | 'column'; readonly id: string } | null>(null);
  protected readonly dropTarget = signal<
    | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
    | { readonly kind: 'task-end'; readonly columnId: UUID }
    | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' }
    | null
  >(null);

  // ---------- 就地编辑 ----------
  protected readonly editingBoardTitle = signal(false);
  protected readonly boardTitleDraft = signal('');
  protected readonly editingBoardDescription = signal(false);
  protected readonly boardDescriptionDraft = signal('');
  protected readonly editingColumnId = signal<UUID | null>(null);
  protected readonly columnTitleDraft = signal('');
  protected readonly editingTaskId = signal<UUID | null>(null);
  protected readonly taskTitleDraft = signal('');
  protected readonly addTaskColumnId = signal<UUID | null>(null);
  protected readonly addTaskTitle = signal('');
  protected readonly creatingTask = signal(false);
  protected readonly addingColumn = signal(false);
  protected readonly addColumnTitle = signal('');
  protected readonly boardComposerTitle = signal('');
  protected readonly labelEditor = signal<LabelEditorState | null>(null);
  protected readonly sortingColumnId = signal<UUID | null>(null);

  // ---------- 详情侧栏（即改即存） ----------
  protected readonly detailTaskId = signal<UUID | null>(null);
  protected readonly detailBase = signal<TaskDraftSnapshot | null>(null);
  protected readonly detailTitle = signal('');
  protected readonly detailDescription = signal('');
  protected readonly detailStatus = signal<string | null>(null);

  // ---------- 选择器 ----------
  protected readonly pickerQuery = signal('');
  protected readonly pickerActive = signal(0);

  // ---------- 筛选 ----------
  protected readonly filterQuery = signal('');
  protected readonly filterFocused = signal(false);
  protected readonly activeSuggestion = signal(-1);

  // ---------- 键盘焦点 ----------
  protected readonly focusedTaskId = signal<UUID | null>(null);

  // ---------- 搜索（US-539 阶段 B，移入对话框） ----------
  protected readonly searchQuery = signal('');
  protected readonly searchState = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly searchResults = signal<readonly SearchResult[]>([]);
  protected readonly searchHasMore = signal(false);
  protected readonly searchErrorText = signal<string | null>(null);
  protected readonly searchHighlightId = signal<UUID | null>(null);

  protected readonly writeLocked = computed(() => {
    const installed = this.board();
    return installed === null || installed.restoring() || installed.loading() || installed.readError() !== null;
  });

  protected readonly taskMap = computed(() => {
    const grouped = new Map<UUID, Task[]>();
    const installed = this.board();
    if (!installed) return grouped;
    for (const column of installed.columns()) grouped.set(column.id, []);
    for (const task of installed.tasks()) grouped.get(task.columnId)?.push(task);
    return grouped;
  });

  protected readonly filter = computed(() => parseBoardFilter(this.filterQuery()));
  protected readonly filterActive = computed(() => !isBoardFilterEmpty(this.filter()));

  protected readonly visibleTaskMap = computed(() => {
    const visible = new Map<UUID, readonly Task[]>();
    const installed = this.board();
    if (!installed) return visible;
    const filter = this.filter();
    const active = this.filterActive();
    const today = this.today();
    for (const column of installed.columns()) {
      const tasks = this.taskMap().get(column.id) ?? [];
      const matches = (task: Task) =>
        matchesBoardFilter(
          {
            title: task.title,
            description: task.description ?? null,
            dueDate: task.dueDate ?? null,
            columnTitle: column.title,
            labelNames: this.labelsOf(task.id).map(label => label.name)
          },
          filter,
          today
        );
      visible.set(column.id, active ? tasks.filter(matches) : tasks);
    }
    return visible;
  });

  protected readonly visibleCount = computed(() =>
    [...this.visibleTaskMap().values()].reduce((sum, tasks) => sum + tasks.length, 0)
  );

  protected readonly suggestions = computed(() => {
    const installed = this.board();
    if (!installed) return [];
    return suggestBoardFilter(this.filterQuery(), {
      labels: installed.labels(),
      columns: installed.columns().map(column => column.title)
    });
  });

  protected readonly suggestionsOpen = computed(
    () => this.filterFocused() && !this.suggestionsDismissed() && this.suggestions().length > 0
  );

  protected readonly activeSuggestionId = computed(() =>
    this.suggestionsOpen() && this.activeSuggestion() >= 0 ?
      `${this.suggestionListId}-${this.activeSuggestion()}`
    : null
  );

  /** 漫游 tabindex：上次聚焦的可见卡片，否则第一张可见卡片。 */
  protected readonly rovingTaskId = computed(() => {
    const visibleIds = [...this.visibleTaskMap().values()].flat().map(task => task.id);
    const focused = this.focusedTaskId();
    return focused !== null && visibleIds.includes(focused) ? focused : (visibleIds[0] ?? null);
  });

  protected readonly detailLabels = computed(() => {
    const base = this.detailBase();
    const installed = this.board();
    if (!base || !installed) return [];
    return installed.labels().filter(label => base.labelIds.includes(label.id));
  });

  protected readonly pickerOptions = computed<readonly PickerOption[]>(() => {
    const pop = this.popover();
    const installed = this.board();
    if (!pop || !installed) return [];
    const query = this.pickerQuery().trim().toLowerCase();
    const selection = this.pickerSelection();
    const options =
      pop.kind === 'detail-label-picker' ?
        installed.labels().map(label => ({ id: label.id, label: label.name, color: label.color }))
      : installed.columns().map(column => ({ id: column.id, label: column.title, color: null }));
    return options
      .filter(option => option.label.toLowerCase().includes(query))
      .map(option => ({ ...option, selected: selection.includes(option.id) }));
  });

  protected readonly canCreateLabelFromPicker = computed(() => {
    const name = this.pickerQuery().trim();
    const installed = this.board();
    if (this.popover()?.kind !== 'detail-label-picker' || name === '' || !installed) return false;
    return !installed.labels().some(label => label.name === name);
  });

  protected get boardRef(): UseBoardReturn {
    const installed = this.board();
    if (!installed) throw new Error('board 尚未安装');
    return installed;
  }

  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  readonly rxdb = input.required<Parameters<typeof useBoard>[0]>();
  /** 备份导出回调（US-537 编排由宿主接线；缺省展示占位提示）。 */
  readonly exportBackup = input<() => void | Promise<void>>();

  ngOnInit(): void {
    // 显式注入上下文：JIT + zoneless 下生命周期钩子不保证自带注入上下文
    const installed = runInInjectionContext(this.injectorRef, () => {
      const installedSearch = this.rxdb().getPlugins('search')[0] as
        { readonly searchCollection?: unknown } | undefined;
      const upstream =
        installedSearch && typeof installedSearch.searchCollection === 'function' ? installedSearch : undefined;
      const searchUnavailableReason: BoardSearchUnavailableReason | undefined =
        installedSearch === undefined ? 'plugin_not_installed'
        : upstream === undefined ? 'adapter_unsupported'
        : undefined;
      return useBoard(
        this.rxdb(),
        upstream ? { search: { upstream: upstream as BoardSearchUpstream } } : { searchUnavailableReason }
      );
    });
    this.board.set(installed);
    // 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
    window.addEventListener('storage', this.onBoardStorage);
    window.addEventListener('focus', this.onTodayActivity);
    window.addEventListener('resize', this.onViewportChange);
    document.addEventListener('visibilitychange', this.onTodayActivity);
    document.addEventListener('keydown', this.onDocumentKeydown);
    document.addEventListener('pointerdown', this.onDocumentPointerdown, true);
    this.onBoardStorage();
    this.onTodayActivity();
  }

  ngOnDestroy(): void {
    this.detailRequest++;
    window.removeEventListener('storage', this.onBoardStorage);
    window.removeEventListener('focus', this.onTodayActivity);
    window.removeEventListener('resize', this.onViewportChange);
    document.removeEventListener('visibilitychange', this.onTodayActivity);
    document.removeEventListener('keydown', this.onDocumentKeydown);
    document.removeEventListener('pointerdown', this.onDocumentPointerdown, true);
    for (const timer of [this.todayTimer, this.noticeTimer, this.toastTimer]) {
      if (timer !== null) window.clearTimeout(timer);
    }
    this.destroySearch();
  }

  // ---------- 模板辅助 ----------

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  /** 标签文字色（对比度，US-539 AC#6）。 */
  protected labelTextColor(color: string): string {
    return pickLabelTextColor(color);
  }

  protected labelsOf(taskId: UUID): readonly BoardLabel[] {
    return this.board()?.taskLabels().get(taskId) ?? [];
  }

  protected tasksOf(column: Column): readonly Task[] {
    return this.taskMap().get(column.id) ?? [];
  }

  protected visibleTasksOf(column: Column): readonly Task[] {
    return this.visibleTaskMap().get(column.id) ?? [];
  }

  protected countLabel(column: Column): string {
    const visible = this.visibleTasksOf(column).length;
    return this.filterActive() ? `筛选后 ${visible} / 共 ${this.tasksOf(column).length} 个任务` : `${visible} 个任务`;
  }

  protected overdueCount(column: Column): number {
    return this.visibleTasksOf(column).filter(task => this.dueStatusOf(task.dueDate ?? null) === 'overdue').length;
  }

  protected dueStatusOf(dueDate: string | null): DueStatus | null {
    return dueStatus(dueDate, this.today());
  }

  protected dueText(dueDate: string): string {
    return dueStatusText(dueDate, this.today());
  }

  protected columnById(columnId: UUID | null): Column | undefined {
    return this.board()
      ?.columns()
      .find(column => column.id === columnId);
  }

  protected taskById(taskId: UUID | null): Task | undefined {
    return this.board()
      ?.tasks()
      .find(task => task.id === taskId);
  }

  protected columnTitleOf(columnId: UUID | null): string {
    return this.columnById(columnId)?.title ?? '';
  }

  protected isFirstColumn(column: Column): boolean {
    return this.board()?.columns()[0]?.id === column.id;
  }

  protected isLastColumn(column: Column): boolean {
    return this.board()?.columns().at(-1)?.id === column.id;
  }

  protected isPopoverFor(kind: BoardPopoverKind, targetId: UUID): boolean {
    const pop = this.popover();
    return pop?.kind === kind && pop.targetId === targetId;
  }

  protected isLabelFiltered(name: string): boolean {
    return this.filteredLabelNames().includes(name.toLowerCase());
  }

  protected popoverLabel(pop: PopoverState): string {
    if (pop.kind === 'board-menu') return '看板操作';
    if (pop.kind === 'column-menu') return `列操作：${this.columnTitleOf(pop.targetId)}`;
    if (pop.kind === 'task-menu') return `任务操作：${this.taskById(pop.targetId)?.title ?? ''}`;
    return pop.kind === 'detail-label-picker' ? '选择标签' : '移到列';
  }

  protected sameColor(a: string, b: string): boolean {
    return a.toLowerCase() === b.trim().toLowerCase();
  }

  protected isValidColor(color: string): boolean {
    return isHexColor(color);
  }

  /** 预览色：输入未完成时沿用灰色，不把非法色交给对比度计算。 */
  protected previewColor(color: string): string {
    return isHexColor(color) ? color.trim() : BOARD_LABEL_COLORS[0].color;
  }

  protected canMoveTask(task: Task, direction: BoardMoveDirection): boolean {
    return resolveKeyboardMove(this.keyboardColumns(), task.id, direction) !== null;
  }

  // ---------- 页头：板 ----------

  protected onBoardSelectionChange(event: Event): void {
    const selector = event.target as HTMLSelectElement;
    this.selectBoard(selector.value as UUID);
    selector.value = this.boardRef.currentBoardId() ?? '';
  }

  protected openBoardComposer(event?: Event): void {
    this.boardComposerTitle.set('');
    this.openDialog({ kind: 'board-composer' }, event);
  }

  /** 建板后切到新板；建板落库期间用户已自己切过板则尊重用户的选择。 */
  protected async submitBoardComposer(): Promise<void> {
    const title = this.boardComposerTitle().trim();
    if (title === '') return;
    const before = this.boardRef.currentBoardId();
    const created = await this.guard(() => this.boardRef.actions.createBoard({ title }));
    if (!created) return;
    this.closeDialog(false);
    if (this.boardRef.currentBoardId() === before) this.selectBoard(created.id);
  }

  protected startBoardTitle(): void {
    this.boardTitleDraft.set(this.boardRef.currentBoard()?.title ?? '');
    this.editingBoardTitle.set(true);
    this.focusSoon('[data-testid="board-title-editor"]');
  }

  protected async commitBoardTitle(): Promise<void> {
    const current = this.boardRef.currentBoard();
    if (!this.editingBoardTitle() || !current) return;
    this.editingBoardTitle.set(false);
    const title = this.boardTitleDraft();
    if (title.trim() === current.title) return;
    const saved = await this.guard(() => this.boardRef.actions.updateBoard(current.id, { title }));
    if (saved === undefined) this.editingBoardTitle.set(true);
  }

  protected cancelBoardTitle(event: Event): void {
    event.stopPropagation();
    this.editingBoardTitle.set(false);
  }

  protected startBoardDescription(): void {
    this.boardDescriptionDraft.set(this.boardRef.currentBoard()?.description ?? '');
    this.editingBoardDescription.set(true);
    this.focusSoon('[data-testid="board-description-editor"]');
  }

  protected async commitBoardDescription(): Promise<void> {
    const current = this.boardRef.currentBoard();
    if (!this.editingBoardDescription() || !current) return;
    this.editingBoardDescription.set(false);
    const description = this.boardDescriptionDraft().trim();
    if (description === (current.description ?? '')) return;
    await this.guard(() => this.boardRef.actions.updateBoard(current.id, { description }));
  }

  protected onBoardDescriptionKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.editingBoardDescription.set(false);
    }
    if (event.key === 'Enter' && isModifier(event)) void this.commitBoardDescription();
  }

  protected openBoardMenu(event: Event): void {
    this.togglePopover('board-menu', null, event);
  }

  protected openShortcuts(): void {
    this.closePopover(false);
    this.openDialog({ kind: 'shortcuts' });
  }

  protected async onExportBackup(): Promise<void> {
    this.closePopover();
    const callback = this.exportBackup();
    if (!callback) {
      this.showNotice('备份导出由宿主接线（US-537）');
      return;
    }
    await this.guard(async () => {
      await callback();
      this.showToast('备份已生成', false);
    });
  }

  protected async confirmBoardDelete(): Promise<void> {
    const current = this.boardRef.currentBoard();
    this.closePopover(false);
    if (!current) return;
    const plan = await this.guard(() => this.boardRef.actions.planBoardDelete(current.id));
    if (plan) this.openDialog({ kind: 'confirm-delete', plan });
  }

  protected async undo(): Promise<void> {
    await this.runHistory(() => this.boardRef.actions.undo());
  }

  protected async redo(): Promise<void> {
    await this.runHistory(() => this.boardRef.actions.redo());
  }

  protected async undoFromToast(): Promise<void> {
    this.toast.set(null);
    await this.undo();
  }

  // ---------- 筛选 ----------

  /** 输入即筛；补全默认高亮第一项，回车直接采纳（GitHub 筛选条同款）。 */
  protected onFilterInput(value: string): void {
    this.filterQuery.set(value);
    this.suggestionsDismissed.set(false);
    this.activeSuggestion.set(0);
  }

  protected onFilterKeydown(event: KeyboardEvent): void {
    const count = this.suggestionsOpen() ? this.suggestions().length : 0;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const current = this.activeSuggestion();
      // 尚未选中时：↓ 到第一项、↑ 到最后一项
      const start = step > 0 ? -1 : count;
      this.activeSuggestion.set(((current < 0 ? start : current) + step + count) % count);
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const suggestion = this.suggestions()[this.activeSuggestion()];
      if (count === 0 || suggestion === undefined) return;
      event.preventDefault();
      this.applySuggestion(suggestion.query);
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.suggestionsOpen()) this.suggestionsDismissed.set(true);
      else (event.target as HTMLInputElement).blur();
    }
  }

  protected applySuggestion(query: string): void {
    this.onFilterInput(query);
    this.focusSoon('[data-testid="board-filter-input"]');
  }

  protected clearFilter(): void {
    this.onFilterInput('');
  }

  /** 点击卡片上的标签即筛选（再次点击取消）。 */
  protected toggleLabelFilter(name: string): void {
    this.filterQuery.set(toggleBoardFilterValue(this.filterQuery(), 'label', name));
    this.suggestionsDismissed.set(true);
  }

  // ---------- 列 ----------

  protected openColumnMenu(event: Event, column: Column): void {
    this.togglePopover('column-menu', column.id, event);
  }

  protected startColumnTitle(columnId: UUID): void {
    this.closePopover(false);
    this.columnTitleDraft.set(this.columnTitleOf(columnId));
    this.editingColumnId.set(columnId);
    this.focusSoon('[data-testid="column-title-editor"]');
  }

  protected async commitColumnTitle(): Promise<void> {
    const columnId = this.editingColumnId();
    if (columnId === null) return;
    this.editingColumnId.set(null);
    const title = this.columnTitleDraft();
    if (title.trim() === this.columnTitleOf(columnId)) return;
    const saved = await this.guard(() => this.boardRef.actions.updateColumn(columnId, { title }));
    if (saved === undefined) this.editingColumnId.set(columnId);
  }

  protected cancelColumnTitle(event: Event): void {
    event.stopPropagation();
    this.editingColumnId.set(null);
  }

  protected async sortColumnBy(columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> {
    if (this.sortingColumnId() !== null) return;
    this.closePopover(false);
    this.sortingColumnId.set(columnId);
    try {
      const result = await this.guard(() => this.boardRef.actions.sortColumn(columnId, mode));
      if (!result) return;
      const label = mode === 'dueDate' ? '截止日' : '标题';
      this.showToast(
        result.written ? `已按${label}排序「${this.columnTitleOf(columnId)}」` : '已按目标顺序排列，无变化',
        result.written
      );
    } finally {
      this.sortingColumnId.set(null);
    }
  }

  protected async moveColumnBy(columnId: UUID, direction: -1 | 1): Promise<void> {
    this.closePopover(false);
    const ids = this.boardRef.columns().map(column => column.id);
    const index = ids.indexOf(columnId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
    const target =
      direction < 0 ?
        { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
      : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
    await this.guard(() => this.boardRef.actions.moveColumn(columnId, target));
    this.focusSoon(`[data-column-header-id="${columnId}"] [data-testid="column-menu-trigger"]`);
  }

  protected async confirmColumnDelete(column: Column): Promise<void> {
    this.closePopover(false);
    const plan = await this.guard(() => this.boardRef.actions.planColumnDelete(column.id));
    if (plan) this.openDialog({ kind: 'confirm-delete', plan });
  }

  protected openAddColumn(): void {
    this.addColumnTitle.set('');
    this.addingColumn.set(true);
    this.focusSoon('[data-testid="column-composer-input"]');
  }

  protected async commitAddColumn(): Promise<void> {
    const title = this.addColumnTitle().trim();
    if (title === '') return;
    const created = await this.guard(() => this.boardRef.actions.createColumn({ title }));
    if (created === undefined) return;
    this.addingColumn.set(false);
    this.addColumnTitle.set('');
  }

  protected cancelAddColumn(event?: Event): void {
    event?.stopPropagation();
    this.addingColumn.set(false);
  }

  protected openAddTask(columnId: UUID): void {
    if (this.creatingTask()) return;
    this.addTaskColumnId.set(columnId);
    this.addTaskTitle.set('');
    this.focusSoon('[data-testid="add-task-input"]');
  }

  protected cancelAddTask(event?: Event): void {
    event?.stopPropagation();
    if (this.creatingTask()) return;
    this.addTaskColumnId.set(null);
    this.addTaskTitle.set('');
  }

  /** 列底建任务（GitHub 同款）：回车即建，输入框保持打开以便连续录入。 */
  protected async commitAddTask(): Promise<void> {
    const columnId = this.addTaskColumnId();
    const title = this.addTaskTitle().trim();
    if (this.creatingTask() || columnId === null || title === '') return;
    this.creatingTask.set(true);
    try {
      const created = await this.guard(() => this.boardRef.actions.createTask({ columnId, title }));
      if (created !== undefined) this.addTaskTitle.set('');
    } finally {
      this.creatingTask.set(false);
    }
    this.focusSoon('[data-testid="add-task-input"]');
  }

  // ---------- 卡片 ----------

  protected openTaskMenu(event: Event, task: Task): void {
    this.togglePopover('task-menu', task.id, event);
  }

  protected startTaskTitle(task: Task): void {
    this.closePopover(false);
    this.taskTitleDraft.set(task.title);
    this.editingTaskId.set(task.id);
    this.focusSoon('[data-testid="task-title-editor"]');
  }

  protected async commitTaskTitle(task: Task): Promise<void> {
    const saved = await this.guard(() => this.boardRef.actions.updateTaskTitle(task.id, this.taskTitleDraft()));
    // 失败保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
    if (saved === undefined) return;
    this.editingTaskId.set(null);
    this.focusTaskSoon(task.id);
  }

  protected cancelTaskTitle(event?: Event): void {
    event?.stopPropagation();
    const taskId = this.editingTaskId();
    this.editingTaskId.set(null);
    if (taskId !== null) this.focusTaskSoon(taskId);
  }

  protected openMovePicker(task: Task): void {
    const anchor = this.popoverAnchor();
    this.popover.set(null);
    this.openPicker('move-picker', task.id, anchor, [task.columnId]);
  }

  protected async moveTaskBy(task: Task, direction: BoardMoveDirection): Promise<void> {
    this.closePopover(false);
    const target = resolveKeyboardMove(this.keyboardColumns(), task.id, direction);
    if (target === null) return;
    if (await this.executeTaskMove(task.id, target)) this.focusTaskSoon(task.id);
  }

  protected async confirmTaskDelete(task: Task): Promise<void> {
    this.closePopover(false);
    const plan = await this.guard(() => this.boardRef.actions.planTaskDelete(task.id));
    if (plan) this.openDialog({ kind: 'confirm-delete', plan });
  }

  protected onCardKeydown(event: KeyboardEvent, task: Task): void {
    if (event.target !== event.currentTarget || !this.runCardKey(event, task)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  // ---------- 详情侧栏 ----------

  protected async openDetail(taskId: UUID): Promise<void> {
    this.closePopover(false);
    const request = ++this.detailRequest;
    this.pendingDetailTaskId = taskId;
    const currentActions = this.boardRef.actions;
    const snapshot = await this.guard(() => currentActions.openSnapshot(taskId));
    if (request !== this.detailRequest || !snapshot) return;
    this.pendingDetailTaskId = null;
    this.detailSession = { taskId, actions: currentActions, base: snapshot };
    this.detailTaskId.set(taskId);
    this.focusedTaskId.set(taskId);
    this.applyDetailSnapshot(snapshot);
    this.detailStatus.set(null);
  }

  protected closeDetail(): void {
    const taskId = this.detailTaskId();
    this.detailRequest++;
    this.detailSession = null;
    this.detailTaskId.set(null);
    this.detailBase.set(null);
    if (taskId !== null) this.focusTaskSoon(taskId);
  }

  protected commitDetailTitle(): Promise<void> {
    const title = this.detailTitle();
    return this.enqueueDetail(async session => {
      if (title !== session.base.title) await this.saveDetailFields(session, { title });
    });
  }
  protected revertDetailTitle(event: Event): void {
    event.stopPropagation();
    this.detailTitle.set(this.detailBase()?.title ?? '');
  }
  protected commitDetailDescription(): Promise<void> {
    const description = this.detailDescription();
    return this.enqueueDetail(async session => {
      if (description.trim() !== (session.base.description ?? ''))
        await this.saveDetailFields(session, { description });
    });
  }
  protected onDetailDescriptionKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.detailDescription.set(this.detailBase()?.description ?? '');
    }
    if (event.key === 'Enter' && isModifier(event)) void this.commitDetailDescription();
  }
  protected commitDetailDue(value: string): Promise<void> {
    return this.enqueueDetail(async session => {
      const dueDate = value === '' ? null : value;
      if (dueDate !== session.base.dueDate) await this.saveDetailFields(session, { dueDate });
    });
  }

  protected openDetailColumnPicker(event: Event): void {
    const base = this.detailBase();
    if (!base || this.closeIfOpen('detail-column-picker')) return;
    this.openPicker('detail-column-picker', this.detailTaskId(), this.anchorOf(event), [base.columnId], event);
  }

  protected openDetailLabelPicker(event: Event): void {
    const base = this.detailBase();
    // 再点同一字段 = 关闭（并提交）：不能以未刷新的旧基线重开
    if (!base || this.closeIfOpen('detail-label-picker')) return;
    this.pickerLabelDraft = base.labelIds;
    this.openPicker('detail-label-picker', this.detailTaskId(), this.anchorOf(event), base.labelIds, event);
  }

  protected async deleteDetailTask(event: Event): Promise<void> {
    const task = this.taskById(this.detailTaskId());
    this.returnFocus = event.currentTarget as HTMLElement;
    if (task) await this.confirmTaskDelete(task);
  }

  // ---------- 选择器 ----------

  protected onPickerInput(value: string): void {
    this.pickerQuery.set(value);
    this.pickerActive.set(0);
  }

  protected onPickerKeydown(event: KeyboardEvent): void {
    const count = this.pickerOptions().length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && count > 0) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.pickerActive.set((this.pickerActive() + step + count) % count);
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const option = this.pickerOptions()[this.pickerActive()];
    if (option) void this.choosePickerOption(option.id);
    else if (this.canCreateLabelFromPicker()) void this.createLabelFromPicker();
  }

  protected async choosePickerOption(optionId: UUID): Promise<void> {
    const pop = this.popover();
    if (!pop) return;
    if (pop.kind === 'detail-label-picker') {
      const selection = this.pickerSelection();
      this.pickerSelection.set(
        selection.includes(optionId) ? selection.filter(id => id !== optionId) : [...selection, optionId]
      );
      return;
    }
    const fromDetail = pop.kind === 'detail-column-picker';
    this.closePopover(fromDetail);
    if (pop.targetId !== null) await this.moveTaskToColumn(pop.targetId, optionId, !fromDetail);
  }

  protected async createLabelFromPicker(): Promise<void> {
    const name = this.pickerQuery().trim();
    const color = nextLabelColor(this.boardRef.labels().map(label => label.color));
    const created = await this.guard(() => this.boardRef.actions.createLabel({ name, color }));
    if (!created) return;
    this.pickerSelection.set([...this.pickerSelection(), created.id]);
    this.onPickerInput('');
  }

  protected onPopoverKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    this.closePopover();
  }

  // ---------- 对话框 ----------

  protected openLabels(event?: Event): void {
    this.labelEditor.set(null);
    this.openDialog({ kind: 'labels' }, event);
  }

  protected openSearch(event?: Event): void {
    this.openDialog({ kind: 'search' }, event);
  }

  protected closeDialog(restoreFocus = true): void {
    const current = this.dialog();
    this.dialog.set(null);
    this.labelEditor.set(null);
    if (current?.kind === 'confirm-label-delete') {
      this.dialog.set({ kind: 'labels' });
      return;
    }
    if (restoreFocus) this.restoreFocus();
  }

  protected onBackdropMousedown(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeDialog();
  }

  protected async executeConfirmedDelete(): Promise<void> {
    const current = this.dialog();
    if (current?.kind === 'confirm-label-delete') {
      this.dialog.set({ kind: 'labels' });
      // executeLabelDelete 成功时返回 void：显式返回 true 区分成功与 guard 吞掉的失败
      const deleted = await this.guard(async () => {
        await this.boardRef.actions.executeLabelDelete(current.plan);
        return true;
      });
      if (deleted) this.showToast(`已删除标签「${current.plan.labelName}」`, true);
      return;
    }
    if (current?.kind !== 'confirm-delete') return;
    this.dialog.set(null);
    const plan = current.plan;
    const deleted = await this.guard(async () => {
      await this.boardRef.actions.executeDelete(plan);
      return true;
    });
    if (!deleted) return;
    const removedIds = plan.kind === 'task' ? [plan.taskId] : plan.taskIds;
    // 正在加载的详情若属于被删集合，迟到的快照不得再打开侧栏
    if (this.pendingDetailTaskId !== null && removedIds.includes(this.pendingDetailTaskId)) this.detailRequest++;
    const detailTaskId = this.detailTaskId();
    if (detailTaskId !== null && removedIds.includes(detailTaskId)) {
      this.detailRequest++;
      this.detailSession = null;
      this.detailTaskId.set(null);
      this.detailBase.set(null);
    }
    // 删掉的是当前板：查询词随句柄一起清空（只销毁句柄会留下旧词，再打开搜索框是一个失效的搜索态）
    if (plan.kind === 'board') this.onSearchInput('');
    this.showToast(this.deletedMessage(plan), true);
  }

  protected startCreateLabel(): void {
    this.labelEditor.set({ labelId: null, name: '', color: nextLabelColor(this.boardRef.labels().map(l => l.color)) });
    this.focusSoon('[data-testid="label-name-input"]');
  }

  protected startEditLabel(label: BoardLabel): void {
    this.labelEditor.set({ labelId: label.id, name: label.name, color: label.color });
    this.focusSoon('[data-testid="label-name-input"]');
  }

  protected updateLabelEditor(patch: Partial<LabelEditorState>): void {
    const editor = this.labelEditor();
    if (editor) this.labelEditor.set({ ...editor, ...patch });
  }

  protected cancelLabelEditor(): void {
    this.labelEditor.set(null);
  }

  protected async saveLabelEditor(): Promise<void> {
    const editor = this.labelEditor();
    if (!editor || editor.name.trim() === '' || !isHexColor(editor.color)) return;
    const saved = await this.guard(() => this.persistLabel(editor));
    if (saved !== undefined) this.labelEditor.set(null);
  }

  protected async deleteLabel(label: BoardLabel): Promise<void> {
    const plan = await this.guard(() => this.boardRef.actions.planLabelDelete(label.id));
    if (plan) this.dialog.set({ kind: 'confirm-label-delete', plan });
  }

  // ---------- 拖拽（只采集指针事件，落点由核心包换算） ----------

  protected onTaskDragStart(event: DragEvent, task: Task): void {
    event.dataTransfer?.setData('application/x-board-task', task.id);
    this.closePopover(false);
    this.dragging.set({ kind: 'task', id: task.id });
  }

  protected onTaskDragOver(event: DragEvent): void {
    // 列头 handler 冒泡到这里，按拖拽类型分流，否则列拖拽的落点会被任务换算覆盖
    event.preventDefault();
    const movedId = this.dragging()?.kind === 'task' ? (this.dragging()?.id as UUID) : undefined;
    const area = this.boardArea()?.nativeElement;
    if (!movedId || !area) return;
    const target = resolveCardDrop(this.columnViews(area), movedId, event.clientX, event.clientY);
    if (target === null) {
      this.dropTarget.set(null);
      return;
    }
    // 插入线只画在看得见的卡片上（筛选隐藏的邻居退回可见邻居，两侧都隐藏则整列高亮）
    const visibleIds = (this.visibleTaskMap().get(target.columnId) ?? []).map(task => task.id);
    const anchor = dropIndicatorAnchor(target, visibleIds);
    this.dropTarget.set(
      anchor === null ?
        { kind: 'task-end', columnId: target.columnId }
      : { kind: 'task', columnId: target.columnId, ...anchor }
    );
  }

  protected onColumnDragStart(event: DragEvent, column: Column): void {
    event.dataTransfer?.setData('application/x-board-column', column.id);
    this.closePopover(false);
    this.dragging.set({ kind: 'column', id: column.id });
  }

  protected onColumnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.dragging()?.kind !== 'column') return;
    const target = this.resolveColumnTarget(this.dragging()!.id as UUID, event.clientX);
    const anchorId = target === null ? null : (target.prevId ?? target.nextId);
    this.dropTarget.set(
      target === null || anchorId === null ?
        null
      : { kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' }
    );
  }

  protected async onTaskDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-task') ||
      (this.dragging()?.kind === 'task' ? this.dragging()?.id : undefined)) as UUID | undefined;
    // 列拖拽冒泡到这里时不清理拖拽态：根层的列落点还要用
    if (!movedId) return;
    const area = this.boardArea()?.nativeElement;
    this.clearDragFeedback();
    if (!area) return;
    const target = resolveCardDrop(this.columnViews(area), movedId, event.clientX, event.clientY);
    if (target) await this.executeTaskMove(movedId, target);
  }

  protected async onColumnDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-column') ||
      (this.dragging()?.kind === 'column' ? this.dragging()?.id : undefined)) as UUID | undefined;
    this.clearDragFeedback();
    if (!movedId) return;
    const target = this.resolveColumnTarget(movedId, event.clientX);
    if (target) await this.guard(() => this.boardRef.actions.moveColumn(movedId, target));
  }

  protected clearDragFeedback(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  protected isDropBefore(task: Task): boolean {
    const target = this.dropTarget();
    return target?.kind === 'task' && target.taskId === task.id && target.mode === 'before';
  }

  protected isDropAfter(task: Task): boolean {
    const target = this.dropTarget();
    return target?.kind === 'task' && target.taskId === task.id && target.mode === 'after';
  }

  protected isDropEnd(column: Column): boolean {
    const target = this.dropTarget();
    return target?.kind === 'task-end' && target.columnId === column.id;
  }

  protected isDropColumn(column: Column): boolean {
    const target = this.dropTarget();
    return target !== null && target.kind !== 'column' && target.columnId === column.id;
  }

  protected isColumnDropBefore(column: Column): boolean {
    const target = this.dropTarget();
    return target?.kind === 'column' && target.columnId === column.id && target.mode === 'before';
  }

  protected isColumnDropAfter(column: Column): boolean {
    const target = this.dropTarget();
    return target?.kind === 'column' && target.columnId === column.id && target.mode === 'after';
  }

  protected isDraggingTask(task: Task): boolean {
    return this.dragging()?.kind === 'task' && this.dragging()?.id === task.id;
  }

  protected isDraggingColumn(column: Column): boolean {
    return this.dragging()?.kind === 'column' && this.dragging()?.id === column.id;
  }

  // ---------- 搜索（US-539 阶段 B） ----------

  /** 输入变化：空查询销毁句柄退出搜索态；否则复用同一句柄。 */
  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    const query = value.trim();
    if (query === '') {
      this.destroySearch();
      return;
    }
    const source = this.board()?.searchSource;
    if (!source) return;
    if (this.searchHandle !== null) {
      this.searchHandle.setQuery(query);
      return;
    }
    const handle = source.search(query);
    this.searchHandle = handle;
    // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
    this.searchSubs.unsubscribe();
    this.searchSubs = new Subscription();
    this.searchSubs.add(handle.state$.subscribe(state => this.searchState.set(state)));
    this.searchSubs.add(handle.results$.subscribe(results => this.searchResults.set(results)));
    this.searchSubs.add(handle.hasMore$.subscribe(more => this.searchHasMore.set(more)));
    this.searchSubs.add(handle.error$.subscribe(error => this.searchErrorText.set(String(error))));
  }

  protected onSearchMore(): void {
    if (this.searchState() === 'loading') return;
    void this.searchHandle?.loadMore();
  }

  /** 点结果：关闭对话框、滚动到目标卡片、聚焦并短暂高亮（更新中不可点）。 */
  protected onSearchResultClick(result: SearchResult): void {
    if (this.searchState() === 'loading') return;
    const targetId = result.id as UUID;
    this.closeDialog(false);
    this.boardArea()
      ?.nativeElement.querySelector<HTMLElement>(`[data-task-id="${targetId}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center' });
    this.focusTaskSoon(targetId);
    this.searchHighlightId.set(targetId);
    window.setTimeout(() => {
      if (this.searchHighlightId() === targetId) this.searchHighlightId.set(null);
    }, 2000);
  }

  protected searchColumnTitle(result: SearchResult): string {
    return this.columnTitleOf(this.taskById(result.id as UUID)?.columnId ?? null);
  }

  protected searchResultTitle(result: SearchResult): string {
    return this.taskById(result.id as UUID)?.title ?? '';
  }

  protected searchUnavailableText(reason: BoardSearchUnavailableReason | null): string {
    return (
      reason === 'plugin_not_installed' ? '搜索插件未安装'
      : reason === 'adapter_unsupported' ? '当前适配器不支持搜索'
      : reason === 'query_failed' ? '搜索查询失败'
      : ''
    );
  }

  // ---------- 弹层 ----------

  protected closePopover(restoreFocus = true): void {
    const pop = this.popover();
    if (!pop) return;
    this.popover.set(null);
    if (pop.kind === 'detail-label-picker') void this.commitPickerLabels();
    if (restoreFocus) this.restoreFocus();
  }

  // ========== 以下为私有实现 ==========

  // ---------- 撤销 / 重做 ----------

  private async runHistory(operation: () => Promise<void>): Promise<void> {
    const done = await this.guard(async () => {
      await operation();
      return true;
    });
    if (done) await this.refreshDetail();
  }

  /** 该种弹层已打开则关闭并返回 true（触发器再点即关闭）。 */
  private closeIfOpen(kind: BoardPopoverKind): boolean {
    if (this.popover()?.kind !== kind) return false;
    this.closePopover();
    return true;
  }

  private togglePopover(kind: BoardPopoverKind, targetId: UUID | null, event: Event): void {
    if (this.popover()?.kind === kind && this.popover()?.targetId === targetId) {
      this.closePopover();
      return;
    }
    this.closePopover(false);
    this.returnFocus = event.currentTarget as HTMLElement;
    this.popover.set(this.placedPopover(kind, targetId, this.anchorOf(event), 'end'));
    this.focusSoon('.rxb-popover button:not(:disabled)');
  }

  private openPicker(
    kind: BoardPopoverKind,
    targetId: UUID | null,
    anchor: DOMRect,
    selection: readonly UUID[],
    event?: Event
  ): void {
    this.closePopover(false);
    if (event) this.returnFocus = event.currentTarget as HTMLElement;
    this.pickerQuery.set('');
    this.pickerActive.set(0);
    this.pickerSelection.set(selection);
    this.popover.set(this.placedPopover(kind, targetId, anchor, kind === 'move-picker' ? 'end' : 'start'));
    this.focusSoon('[data-testid="picker-filter"]');
  }

  private placedPopover(
    kind: BoardPopoverKind,
    targetId: UUID | null,
    anchor: DOMRect,
    align: 'start' | 'end'
  ): PopoverState {
    const width = POPOVER_WIDTH[kind];
    const position = placePopover(
      anchor,
      { width, height: POPOVER_HEIGHT[kind] },
      { width: window.innerWidth, height: window.innerHeight },
      { align }
    );
    return { kind, targetId, width, ...position };
  }

  private anchorOf(event: Event): DOMRect {
    return (event.currentTarget as HTMLElement).getBoundingClientRect();
  }

  /** 当前菜单的位置作为子选择器的锚点（「移到列…」从卡片菜单展开）。 */
  private popoverAnchor(): DOMRect {
    const pop = this.popover();
    return pop ? new DOMRect(pop.left + pop.width, pop.top, 0, 0) : new DOMRect();
  }

  private async commitPickerLabels(): Promise<void> {
    const selection = this.pickerSelection();
    const before = this.pickerLabelDraft;
    if (selection.length === before.length && selection.every(id => before.includes(id))) return;
    await this.enqueueDetail(session => this.saveDetailFields(session, { labelIds: selection }));
  }

  /** 移到目标列末尾（与 GitHub「Move to column」一致）；从详情侧栏发起时焦点留在侧栏。 */
  private async moveTaskToColumn(taskId: UUID, columnId: UUID, focusCard: boolean): Promise<void> {
    const column = this.taskMap().get(columnId) ?? [];
    const target = resolveMenuMove(this.menuColumns(), taskId, columnId, column.length);
    if (target === null) return;
    if ((await this.executeTaskMove(taskId, target)) && focusCard) this.focusTaskSoon(taskId);
  }

  // ---------- 对话框 / 提示 ----------

  private openDialog(state: DialogState, event?: Event): void {
    this.closePopover(false);
    if (event) this.returnFocus = event.currentTarget as HTMLElement;
    this.dialog.set(state);
    this.focusSoon('.rxb-dialog [data-autofocus]');
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
  }

  private showNotice(message: string): void {
    this.notice.set(message);
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.set(null), 5000);
  }

  private showToast(message: string, undoable: boolean): void {
    this.toast.set({ message, undoable });
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.set(null), 6000);
  }

  private deletedMessage(plan: DeletePlan): string {
    if (plan.kind === 'task') return `已删除任务「${plan.taskTitle}」`;
    if (plan.kind === 'column') return `已删除列「${plan.columnTitle}」`;
    return `已删除看板「${plan.boardTitle}」`;
  }

  /** 新建或保存标签；编辑时只写改动的名称 / 颜色（标签已被删由领域入口报 label_not_found）。 */
  private async persistLabel(editor: LabelEditorState): Promise<true> {
    const actions = this.boardRef.actions;
    const color = editor.color.trim();
    if (editor.labelId === null) {
      await actions.createLabel({ name: editor.name, color });
      return true;
    }
    const label = this.boardRef.labels().find(item => item.id === editor.labelId);
    if (label?.name !== editor.name.trim()) await actions.renameLabel(editor.labelId, editor.name);
    if (label === undefined || !this.sameColor(label.color, color)) await actions.recolorLabel(editor.labelId, color);
    return true;
  }

  // ---------- 详情保存队列 ----------

  /** 详情字段的提交串行执行：回车后紧跟失焦等重复提交读到的是上一笔保存后的基线。 */
  private enqueueDetail(operation: (session: DetailSession) => Promise<unknown>): Promise<void> {
    const session = this.detailSession;
    if (session === null) return Promise.resolve();
    const run = () => operation(session);
    const next = this.detailQueue.then(run, run);
    this.detailQueue = next.catch(() => undefined);
    return next.then(() => undefined);
  }

  private async saveDetailFields(session: DetailSession, patch: TaskFieldPatch): Promise<void> {
    if (session === this.detailSession) this.detailStatus.set('保存中…');
    const result = await this.guard(() => session.actions.saveTaskFields(session.taskId, session.base, patch));
    if (result === undefined) {
      if (session === this.detailSession) this.detailStatus.set(null);
      return;
    }
    const fresh = await this.guard(() => session.actions.openSnapshot(session.taskId));
    if (fresh) session.base = fresh;
    if (session !== this.detailSession) return;
    if (!fresh) {
      this.detailStatus.set(null);
      return;
    }
    this.detailBase.set(fresh);
    if (patch.title !== undefined) this.detailTitle.set(fresh.title);
    if (patch.description !== undefined) this.detailDescription.set(fresh.description ?? '');
    this.detailStatus.set(result.kind === 'saved' ? '已保存' : null);
  }

  /** 撤销 / 重做后重读详情：侧栏不显示旧值、下次编辑不被误判冲突；任务已不存在则关闭侧栏。 */
  private async refreshDetail(): Promise<void> {
    const taskId = this.detailTaskId();
    if (taskId === null) return;
    try {
      const snapshot = await this.boardRef.actions.openSnapshot(taskId);
      if (taskId === this.detailTaskId()) this.applyDetailSnapshot(snapshot);
    } catch {
      if (taskId === this.detailTaskId()) this.closeDetail();
    }
  }

  private applyDetailSnapshot(snapshot: TaskDraftSnapshot): void {
    if (this.detailSession !== null) this.detailSession.base = snapshot;
    this.detailBase.set(snapshot);
    this.detailTitle.set(snapshot.title);
    this.detailDescription.set(snapshot.description ?? '');
  }

  // ---------- 键盘 ----------

  private runCardKey(event: KeyboardEvent, task: Task): boolean {
    const move = event.altKey ? MOVE_KEYS[event.key] : undefined;
    if (move !== undefined) {
      void this.moveTaskBy(task, move);
      return true;
    }
    const direction = event.altKey ? undefined : FOCUS_KEYS[event.key];
    if (direction !== undefined) {
      const next = nextGridFocus(this.gridColumns(), task.id, direction);
      if (next !== null) this.focusTaskSoon(next);
      return true;
    }
    return this.runCardCommand(event, task);
  }

  private runCardCommand(event: KeyboardEvent, task: Task): boolean {
    if (event.key === 'Enter' || event.key === ' ') {
      void this.openDetail(task.id);
      return true;
    }
    if (event.key === 'F2') {
      this.startTaskTitle(task);
      return true;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.returnFocus = event.currentTarget as HTMLElement;
      void this.confirmTaskDelete(task);
      return true;
    }
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return false;
    const card = event.currentTarget as HTMLElement;
    // 先关已开的弹层（标签选择器的草稿照常提交），再打开卡片菜单
    this.closePopover(false);
    this.returnFocus = card;
    this.popover.set(this.placedPopover('task-menu', task.id, card.getBoundingClientRect(), 'end'));
    this.focusSoon('.rxb-popover button:not(:disabled)');
    return true;
  }

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    const root = this.boardArea()?.nativeElement;
    const active = document.activeElement;
    const inside = active === null || active === document.body || (root?.contains(active) ?? false);
    if (!root || event.defaultPrevented || !inside) return;
    if (event.key === 'Escape') {
      if (this.handleEscape()) event.preventDefault();
      return;
    }
    if (event.key === 'Tab' && this.dialog() !== null) {
      if (focusModalTab(root, event.shiftKey)) event.preventDefault();
      return;
    }
    if (isModifier(event) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.board()?.searchSource || this.board()?.searchUnavailableReason) this.openSearch();
      return;
    }
    if (isEditable(event.target) || this.dialog() !== null) return;
    if (this.runGlobalShortcut(event)) event.preventDefault();
  };

  /** 模态对话框打开时 Tab 只在对话框内循环（首尾绕回，目标由核心包 `trapTabFocus` 换算）；返回是否接管。 */
  private runGlobalShortcut(event: KeyboardEvent): boolean {
    if (isModifier(event) && event.key.toLowerCase() === 'z') {
      void (event.shiftKey ? this.redo() : this.undo());
      return true;
    }
    if (isModifier(event) || event.altKey) return false;
    if (event.key === '?') {
      this.openShortcuts();
      return true;
    }
    if (event.key !== '/') return false;
    this.boardArea()?.nativeElement.querySelector<HTMLInputElement>('[data-testid="board-filter-input"]')?.focus();
    return true;
  }

  /** Esc 由内向外：弹层 → 对话框 → 详情侧栏。 */
  private handleEscape(): boolean {
    if (this.popover()) {
      this.closePopover();
      return true;
    }
    if (this.dialog()) {
      this.closeDialog();
      return true;
    }
    if (this.detailTaskId() === null) return false;
    this.closeDetail();
    return true;
  }

  /**
   * 外部指针按下（捕获阶段）关闭弹层；本实例的弹层内与本实例展开中的触发器除外——
   * 同页另一个看板、宿主自己的展开控件（accordion / combobox）都算外部。
   */
  private readonly onDocumentPointerdown = (event: PointerEvent): void => {
    if (!this.popover()) return;
    const hit = (event.target as Element | null)?.closest('.rxb-popover, [aria-expanded="true"]');
    if (hit && this.boardArea()?.nativeElement.contains(hit)) return;
    this.closePopover(false);
  };

  private readonly onViewportChange = (): void => {
    this.closePopover(false);
  };

  // ---------- 视图辅助 ----------

  private gridColumns(): { readonly columnId: UUID; readonly taskIds: readonly UUID[] }[] {
    return this.boardRef.columns().map(column => ({
      columnId: column.id,
      taskIds: this.visibleTasksOf(column).map(task => task.id)
    }));
  }

  private menuColumns(): { readonly columnId: UUID; readonly taskIds: readonly UUID[] }[] {
    return this.boardRef.columns().map(column => ({
      columnId: column.id,
      taskIds: this.tasksOf(column).map(task => task.id)
    }));
  }

  private keyboardColumns() {
    return this.boardRef.columns().map(column => ({
      columnId: column.id,
      taskIds: this.tasksOf(column).map(task => task.id),
      visibleIds: this.visibleTasksOf(column).map(task => task.id)
    }));
  }

  private selectBoard(boardId: UUID): void {
    this.closePopover(false);
    this.detailRequest++;
    this.detailSession = null;
    this.detailTaskId.set(null);
    this.detailBase.set(null);
    this.boardRef.selectBoard(boardId);
    // 切板销毁旧搜索句柄（setQuery 同词会被 distinctUntilChanged 吞掉，必须重建）
    const query = this.searchQuery().trim();
    this.destroySearch();
    if (query !== '') this.onSearchInput(query);
  }

  /**
   * 聚焦卡片并在约 1 秒内守住：提交与重渲染是异步的，卡片节点被移动 / 重建时焦点会掉回 body，
   * 掉回时补聚焦；用户已把焦点移到别处（如按 `/` 进筛选框）立即停止，不抢焦点。
   */
  private focusTaskSoon(taskId: UUID, attempts = 60, force = true): void {
    const card = this.boardArea()?.nativeElement.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    const active = document.activeElement;
    const idle = active === null || active === document.body || active === card;
    if (!force && !idle) return;
    if (card && active !== card) card.focus();
    if (attempts > 0) requestAnimationFrame(() => this.focusTaskSoon(taskId, attempts - 1, false));
  }

  /**
   * 等目标渲染且可聚焦再聚焦（变更检测与活查询回流都是异步的；禁用中的输入框 focus 会静默失败），
   * 逐帧重试至多 30 帧。
   */
  private focusSoon(selector: string, attempts = 30): void {
    const target = this.boardArea()?.nativeElement.querySelector<HTMLElement>(selector);
    target?.focus();
    if (target && document.activeElement === target) return;
    if (attempts > 0) requestAnimationFrame(() => this.focusSoon(selector, attempts - 1));
  }

  private async executeTaskMove(taskId: UUID, target: CardDropTarget): Promise<boolean> {
    this.notice.set(null);
    try {
      await this.boardRef.actions.moveTask(taskId, target);
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : String(error));
      return false;
    }
    const base = this.detailBase();
    if (this.detailTaskId() === taskId && base !== null) {
      const fresh = { ...base, columnId: target.columnId };
      if (this.detailSession !== null) this.detailSession.base = fresh;
      this.detailBase.set(fresh);
    }
    this.showToast(`已移动到「${this.columnTitleOf(target.columnId)}」`, true);
    return true;
  }

  private destroySearch(): void {
    this.searchSubs.unsubscribe();
    this.searchSubs = new Subscription();
    this.searchHandle?.destroy();
    this.searchHandle = null;
    this.searchState.set('idle');
    this.searchResults.set([]);
    this.searchHasMore.set(false);
    this.searchErrorText.set(null);
  }

  /** 拖拽几何：每次 dragover 现量：落点指示是伪元素 / 阴影、不触发重排，读的是干净布局；拖拽开始时缓存会在拖拽自动滚动后失效。 */
  private columnViews(area: HTMLElement): CardDropColumnView[] {
    return this.boardRef.columns().map(column => {
      const rect = area.querySelector<HTMLElement>(`[data-column-id="${column.id}"]`)?.getBoundingClientRect();
      // 几何只取可见卡片，邻居取完整序列（筛选隐藏的兄弟不被夹在两个邻居之间）
      const cards = this.visibleTasksOf(column).flatMap(task => {
        const cardRect = area.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`)?.getBoundingClientRect();
        return cardRect ? [{ id: task.id, top: cardRect.top, bottom: cardRect.bottom }] : [];
      });
      return {
        columnId: column.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: this.tasksOf(column).map(task => task.id)
      };
    });
  }

  private resolveColumnTarget(
    movedId: UUID,
    clientX: number
  ): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null {
    const area = this.boardArea()?.nativeElement;
    const views = this.boardRef.columns().map(column => {
      const rect = area?.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`)?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    return resolveColumnDrop(
      views,
      this.boardRef.columns().map(column => column.id),
      movedId,
      clientX
    );
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      this.notice.set(null);
      return await operation();
    } catch (error) {
      this.showNotice(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  /** 恢复标记跨页同步：读 localStorage 标记并把门禁下发到领域桥。 */
  private readonly onBoardStorage = (): void => {
    this.board()?.setRestoring(
      typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null
    );
  };

  private readonly onTodayActivity = (): void => {
    const now = new Date();
    this.today.set(localDateKey(now));
    if (this.todayTimer !== null) window.clearTimeout(this.todayTimer);
    this.todayTimer = window.setTimeout(this.onTodayActivity, msUntilNextLocalMidnight(now));
  };
}
