import type { UUID } from '@aiao/rxdb';
import {
  Column,
  labelTextColor as pickLabelTextColor,
  resolveCardDrop,
  resolveColumnDrop,
  resolveMenuMove,
  RESTORING_MARKER_KEY,
  Task,
  type BoardSearchUnavailableReason,
  type BoardSearchUpstream,
  type CardDropColumnView,
  type CardDropTarget,
  type DeletePlan,
  type SearchHandle,
  type SearchResult,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';
import { CommonModule } from '@angular/common';
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
import { FormsModule } from '@angular/forms';

import { Subscription } from 'rxjs';

import { useBoard, type UseBoardReturn } from './use-board.js';

/**
 * 看板视图组件（US-539 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
 * 标签管理 + 撤销重做 + 备份入口占位 + 删除确认。
 *
 * 三端只采集指针事件，落点换算调用核心包同一份 `resolveCardDrop` /
 * `resolveColumnDrop`；全部写入口经 {@link useBoard} 的领域动作
 * （恢复中写门禁与校验在服务层复核，不靠隐藏按钮）。
 */
@Component({
  selector: 'board-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-view.html',
  styles: [
    `
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
      /* 列底内联建任务 */
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
      /* 详情面板菜单式移动（AC#6） */
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
    `
  ]
})
export class BoardViewComponent implements OnInit, OnDestroy {
  private readonly injectorRef = inject(Injector);

  private noticeTimer: number | null = null;
  private todayTimer: number | null = null;
  private searchHandle: SearchHandle | null = null;
  private searchSubs = new Subscription();

  /** 输入绑定完成后（ngOnInit）安装的领域桥；首帧为 null。 */
  private snapshot: TaskDraftSnapshot | null = null;
  private detailRequest = 0;
  private pendingDetailTaskId: UUID | null = null;

  protected readonly today = signal(this.localToday());
  protected readonly board = signal<UseBoardReturn | null>(null);

  /** 正在拖拽的任务 / 列与指针轨迹。 */
  protected readonly dragging = signal<{
    readonly kind: 'task' | 'column';
    readonly id: string;
  } | null>(null);
  /** 拖拽落点反馈（GitHub Projects 同款：插入线 / 列高亮 / 空列占位）。 */
  protected readonly dropTarget = signal<
    | { readonly kind: 'task'; readonly columnId: UUID; readonly mode: 'before' | 'after'; readonly taskId: UUID }
    | { readonly kind: 'task-end'; readonly columnId: UUID }
    | { readonly kind: 'column'; readonly columnId: UUID; readonly mode: 'before' | 'after' }
    | null
  >(null);
  protected readonly detailTaskId = signal<UUID | null>(null);
  protected readonly confirmDelete = signal<DeletePlan | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly boardArea = viewChild<ElementRef<HTMLElement>>('boardArea');

  protected readonly taskMap = computed(() => {
    const grouped = new Map<UUID, Task[]>();
    const installed = this.board();
    if (!installed) return grouped;
    for (const column of installed.columns()) grouped.set(column.id, []);
    for (const task of installed.tasks()) {
      const list = grouped.get(task.columnId) ?? [];
      list.push(task);
      grouped.set(task.columnId, list);
    }
    return grouped;
  });

  protected editTitle = signal<UUID | null>(null);
  /** 内联编辑标题草稿（与详情面板的标题草稿分离，避免互相污染）。 */
  protected readonly editTitleValue = signal('');
  /** 内联建任务（GitHub Projects 同款：列底输入框，Enter 提交 / Esc 取消）。 */
  protected readonly addTaskColumnId = signal<UUID | null>(null);
  protected readonly addTaskTitle = signal('');
  protected readonly creatingTask = signal(false);

  protected readonly detailDraftTitle = signal('');
  protected readonly draftDescription = signal<string>('');
  /** 写入口 busy 状态（US-539 交互约定「写入」行：执行中阻止重复提交）。 */
  protected readonly savingDetail = signal(false);
  protected readonly sortingColumnId = signal<UUID | null>(null);
  /** 菜单式移动（US-539 AC#6 键盘等价路径）：目标列与插入下标。 */
  protected readonly moveColumnId = signal<UUID | null>(null);
  protected readonly movePosition = signal(0);
  protected readonly moveTasks = computed(() =>
    (this.taskMap().get(this.moveColumnId()!) ?? []).filter(task => task.id !== this.detailTaskId())
  );
  protected readonly draftDueDate = signal<string>('');
  protected readonly draftLabelIds = signal<readonly UUID[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly searchState = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly searchResults = signal<readonly SearchResult[]>([]);
  protected readonly searchHasMore = signal(false);
  protected readonly searchErrorText = signal<string | null>(null);
  protected readonly searchHighlightId = signal<UUID | null>(null);

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
        | { readonly searchCollection?: unknown }
        | undefined;
      const upstream =
        installedSearch && typeof installedSearch.searchCollection === 'function' ? installedSearch : undefined;
      const searchUnavailableReason: BoardSearchUnavailableReason | undefined =
        installedSearch === undefined ? 'plugin_not_installed' : upstream === undefined ? 'adapter_unsupported' : undefined;
      return useBoard(
        this.rxdb(),
        upstream ?
          { search: { upstream: upstream as BoardSearchUpstream } }
        : { searchUnavailableReason }
      );
    });
    this.board.set(installed);
    // 跨页恢复门禁（US-539 AC#5）：另一页开始恢复时经 storage 事件同步「恢复中」
    window.addEventListener('storage', this.onBoardStorage);
    window.addEventListener('focus', this.onTodayActivity);
    document.addEventListener('visibilitychange', this.onTodayActivity);
    this.onBoardStorage();
    this.onTodayActivity();
  }

  ngOnDestroy(): void {
    this.invalidateDetailRequest();
    window.removeEventListener('storage', this.onBoardStorage);
    window.removeEventListener('focus', this.onTodayActivity);
    document.removeEventListener('visibilitychange', this.onTodayActivity);
    if (this.todayTimer !== null) window.clearTimeout(this.todayTimer);
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.searchSubs.unsubscribe();
    this.destroySearch();
  }

  /** 标签文字色（对比度，US-539 AC#6）：模板无法直接调模块级函数，包一层成员。 */
  protected labelTextColor(color: string): string {
    return pickLabelTextColor(color);
  }

  // ---------- 创建 ----------

  protected async createBoard(): Promise<void> {
    const title = window.prompt('新建看板：标题');
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.createBoard({ title }));
  }

  protected async createColumn(): Promise<void> {
    const title = window.prompt('新建列：标题');
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.createColumn({ title }));
  }

  protected openAddTask(columnId: UUID): void {
    if (this.creatingTask()) return;
    this.addTaskColumnId.set(columnId);
    this.addTaskTitle.set('');
  }

  protected cancelAddTask(): void {
    if (this.creatingTask()) return;
    this.addTaskColumnId.set(null);
    this.addTaskTitle.set('');
  }

  protected async commitAddTask(): Promise<void> {
    if (this.creatingTask()) return;
    const columnId = this.addTaskColumnId();
    const title = this.addTaskTitle().trim();
    if (columnId === null || title === '') {
      this.cancelAddTask();
      return;
    }
    this.creatingTask.set(true);
    try {
      const created = await this.guard(() => this.boardRef.actions.createTask({ columnId, title }));
      if (created !== undefined) {
        this.addTaskColumnId.set(null);
        this.addTaskTitle.set('');
      }
    } finally {
      this.creatingTask.set(false);
    }
  }

  // ---------- 标题内联编辑 ----------

  protected async renameBoard(): Promise<void> {
    const current = this.boardRef.currentBoard();
    if (!current) return;
    const title = window.prompt('改板标题', current.title);
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.updateBoard(current.id, { title }));
  }

  protected async renameColumn(columnId: UUID): Promise<void> {
    const column = this.boardRef.columns().find(c => c.id === columnId);
    if (!column) return;
    const title = window.prompt('改列标题', column.title);
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.updateColumn(columnId, { title }));
  }

  protected async startEditTitle(task: Task): Promise<void> {
    this.editTitleValue.set(task.title);
    this.editTitle.set(task.id);
  }

  protected async commitEditTitle(task: Task): Promise<void> {
    const value = this.editTitleValue();
    const result = await this.guard(() => this.boardRef.actions.updateTaskTitle(task.id, value));
    // 失败保留编辑器与草稿（US-539 交互约定「失败保留草稿」）
    if (result === undefined) return;
    this.editTitle.set(null);
  }

  protected cancelEditTitle(): void {
    this.editTitle.set(null);
  }

  // ---------- 拖拽（只采集指针事件，落点由核心包换算） ----------

  protected onTaskDragStart(event: DragEvent, task: Task): void {
    event.dataTransfer?.setData('application/x-board-task', task.id);
    this.dragging.set({ kind: 'task', id: task.id });
  }

  protected onTaskDragOver(event: DragEvent): void {
    // 列头 handler 冒泡到这里，按拖拽类型分流，否则列拖拽的落点会被任务换算覆盖
    event.preventDefault();
    if (this.dragging()?.kind !== 'task') return;
    const movedId = this.dragging()?.id as UUID | undefined;
    const area = this.boardArea()?.nativeElement;
    if (!movedId || !area) return;
    const target = resolveCardDrop(this.columnViews(area), movedId, event.clientX, event.clientY);
    if (!target) {
      this.dropTarget.set(null);
      return;
    }
    this.dropTarget.set(
      target.kind === 'end' ?
        { kind: 'task-end', columnId: target.columnId }
      : {
          kind: 'task',
          columnId: target.columnId,
          mode: target.prevId === null ? 'before' : 'after',
          taskId: (target.prevId ?? target.nextId)!
        }
    );
  }

  protected onColumnDragStart(event: DragEvent, column: Column): void {
    event.dataTransfer?.setData('application/x-board-column', column.id);
    this.dragging.set({ kind: 'column', id: column.id });
  }

  protected onColumnDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.dragging()?.kind !== 'column') return;
    const movedId = this.dragging()?.id as UUID | undefined;
    if (!movedId) return;
    const target = resolveColumnDrop(
      this.boardRef.columns().map(column => ({ columnId: column.id, rect: this.columnRect(column.id) })),
      this.boardRef.columns().map(column => column.id),
      movedId,
      event.clientX
    );
    if (!target) {
      this.dropTarget.set(null);
      return;
    }
    const anchorId = target.prevId ?? target.nextId;
    if (anchorId === null) {
      this.dropTarget.set(null);
      return;
    }
    this.dropTarget.set({ kind: 'column', columnId: anchorId, mode: target.prevId === null ? 'before' : 'after' });
  }

  protected async onTaskDrop(event: DragEvent, column: Column): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-task') ??
      (this.dragging()?.kind === 'task' ? this.dragging()?.id : undefined)) as UUID | undefined;
    if (!movedId) return;
    this.clearDragFeedback();
    const area = this.boardArea()?.nativeElement;
    if (!area) return;
    const target = this.resolveTaskTarget(column, movedId, event.clientX, event.clientY, area);
    if (!target) return;
    await this.executeTaskMove(movedId, target);
  }

  protected async onColumnDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-column') ??
      (this.dragging()?.kind === 'column' ? this.dragging()?.id : undefined)) as UUID | undefined;
    if (!movedId) return;
    this.clearDragFeedback();
    const area = this.boardArea()?.nativeElement;
    if (!area) return;
    const target = this.resolveColumnTarget(movedId, event.clientX, area);
    if (!target) return;
    await this.guard(() => this.boardRef.actions.moveColumn(movedId, target));
  }

  protected async sortColumnBy(columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> {
    if (this.sortingColumnId() !== null) return;
    this.sortingColumnId.set(columnId);
    try {
      const result = await this.guard(() => this.boardRef.actions.sortColumn(columnId, mode));
      if (result && !result.written) this.notice.set('已按目标顺序排列，无变化');
    } finally {
      this.sortingColumnId.set(null);
    }
  }

  protected async moveColumnBy(columnId: UUID, direction: -1 | 1): Promise<void> {
    const ids = this.boardRef.columns().map(column => column.id);
    const index = ids.indexOf(columnId);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    const target =
      direction < 0 ?
        { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
      : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
    await this.guard(() => this.boardRef.actions.moveColumn(columnId, target));
  }

  // ---------- 详情面板 ----------

  protected async openDetail(taskId: UUID): Promise<void> {
    this.invalidateDetailRequest();
    const request = this.detailRequest;
    if (this.detailTaskId() === taskId) return;
    if (this.isDetailDirty() && !window.confirm('有未保存的修改，切换任务将放弃。继续？')) return;
    this.pendingDetailTaskId = taskId;
    const draftState = this.detailDraftState();
    const snap = await this.guard(() => this.boardRef.actions.openSnapshot(taskId));
    if (request !== this.detailRequest) return;
    this.pendingDetailTaskId = null;
    if (!snap) return;
    if (draftState !== this.detailDraftState()) return;
    this.snapshot = snap;
    this.detailTaskId.set(taskId);
    this.detailDraftTitle.set(snap.title);
    this.draftDescription.set(snap.description ?? '');
    this.draftDueDate.set(snap.dueDate ?? '');
    this.draftLabelIds.set([...snap.labelIds]);
    this.moveColumnId.set(snap.columnId);
    this.movePosition.set(0);
  }

  /** 详情草稿相对快照是否有未保存修改（US-539「详情」行：关闭 / 切板先确认放弃）。 */
  protected isDetailDirty(): boolean {
    return (
      this.snapshot !== null &&
      (this.detailDraftTitle() !== this.snapshot.title ||
        this.draftDescription() !== (this.snapshot.description ?? '') ||
        this.draftDueDate() !== (this.snapshot.dueDate ?? '') ||
        [...this.draftLabelIds()].sort().join(',') !== [...this.snapshot.labelIds].sort().join(','))
    );
  }

  protected closeDetail(): void {
    if (this.isDetailDirty() && !window.confirm('有未保存的修改，关闭将放弃。继续？')) return;
    this.invalidateDetailRequest();
    this.detailTaskId.set(null);
    this.snapshot = null;
  }

  /** 菜单式移动（AC#6）：目标列 + 插入下标 → 核心换算表 → 移动；原位零写提示。 */
  protected async moveTaskByMenu(): Promise<void> {
    const taskId = this.detailTaskId();
    const columnId = this.moveColumnId();
    if (taskId === null || columnId === null) return;
    const target = resolveMenuMove(
      this.boardRef.columns().map(column => ({
        columnId: column.id,
        taskIds: (this.taskMap().get(column.id) ?? []).map(task => task.id)
      })),
      taskId,
      columnId,
      this.movePosition()
    );
    if (target === null) {
      this.notice.set('任务已在该位置');
      return;
    }
    if (await this.executeTaskMove(taskId, target)) this.focusMovedCard(taskId);
  }

  protected async saveDetail(): Promise<void> {
    const taskId = this.detailTaskId();
    if (!taskId || !this.snapshot || this.savingDetail()) return;
    const snapshot = this.snapshot;
    this.savingDetail.set(true);
    try {
      const result = await this.guard(() =>
        this.boardRef.actions.saveTaskDraft(taskId, snapshot, {
          title: this.detailDraftTitle(),
          description: this.draftDescription(),
          dueDate: this.draftDueDate() === '' ? null : this.draftDueDate(),
          labelIds: this.draftLabelIds()
        })
      );
      // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
      if (result === undefined) return;
      if (taskId !== this.detailTaskId() || snapshot !== this.snapshot) return;
      // 保存成功直接关（不走 closeDetail 的未保存确认：草稿与旧快照的差异已被本次保存清掉）
      this.detailTaskId.set(null);
      this.snapshot = null;
    } finally {
      this.savingDetail.set(false);
    }
  }

  protected toggleDraftLabel(labelId: UUID): void {
    const current = this.draftLabelIds();
    this.draftLabelIds.set(current.includes(labelId) ? current.filter(id => id !== labelId) : [...current, labelId]);
  }

  // ---------- 标签管理 ----------

  protected async createLabel(): Promise<void> {
    const name = window.prompt('新建标签：名称');
    if (name === null) return;
    const color = window.prompt('标签颜色（#rrggbb）', '#e11d48');
    if (color === null) return;
    await this.guard(() => this.boardRef.actions.createLabel({ name, color }));
  }

  protected async renameLabel(labelId: UUID): Promise<void> {
    const label = this.boardRef.labels().find(item => item.id === labelId);
    if (!label) return;
    const name = window.prompt('改标签名', label.name);
    if (name === null) return;
    await this.guard(() => this.boardRef.actions.renameLabel(labelId, name));
  }

  protected async recolorLabel(labelId: UUID): Promise<void> {
    const label = this.boardRef.labels().find(item => item.id === labelId);
    if (!label) return;
    const color = window.prompt('改标签颜色（#rrggbb）', label.color);
    if (color === null) return;
    await this.guard(() => this.boardRef.actions.recolorLabel(labelId, color));
  }

  protected async deleteLabel(labelId: UUID): Promise<void> {
    const plan = await this.guard(() => this.boardRef.actions.planLabelDelete(labelId));
    if (!plan) return;
    const confirmed = window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`);
    if (!confirmed) return;
    await this.guard(() => this.boardRef.actions.executeLabelDelete(plan));
  }

  // ---------- 删除确认（确认在事务外、集合在事务内复核） ----------

  /** 详情面板删除入口：先出确认（确认在事务外，集合在事务内复核）。 */
  protected async deleteDetailTask(): Promise<void> {
    const taskId = this.detailTaskId();
    if (!taskId) return;
    const task = this.board()
      ?.tasks()
      .find(candidate => candidate.id === taskId);
    if (task) await this.confirmTaskDelete(task);
  }

  protected async confirmTaskDelete(task: Task): Promise<void> {
    const plan = await this.guard(() => this.boardRef.actions.planTaskDelete(task.id));
    if (!plan) return;
    this.confirmDelete.set(plan);
  }

  protected async confirmColumnDelete(column: Column): Promise<void> {
    const plan = await this.guard(() => this.boardRef.actions.planColumnDelete(column.id));
    if (!plan) return;
    this.confirmDelete.set(plan);
  }

  protected async confirmBoardDelete(): Promise<void> {
    const current = this.boardRef.currentBoard();
    if (!current) return;
    const plan = await this.guard(() => this.boardRef.actions.planBoardDelete(current.id));
    if (!plan) return;
    this.confirmDelete.set(plan);
  }

  protected async executeConfirmedDelete(): Promise<void> {
    const pending = this.confirmDelete();
    if (!pending) return;
    this.confirmDelete.set(null);
    const deleted = await this.guard(async () => {
      await this.boardRef.actions.executeDelete(pending);
      return true;
    });
    if (!deleted) return;
    const removedIds = pending.kind === 'task' ? [pending.taskId] : pending.taskIds;
    if (this.pendingDetailTaskId !== null && removedIds.includes(this.pendingDetailTaskId)) {
      this.invalidateDetailRequest();
    }
    const taskId = this.detailTaskId();
    if (taskId !== null && removedIds.includes(taskId)) {
      this.detailTaskId.set(null);
      this.snapshot = null;
    }
    if (pending.kind === 'board') this.onSearchInput('');
  }

  protected cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  // ---------- 撤销重做 / 备份入口 ----------

  protected async undo(): Promise<void> {
    await this.guard(() => this.boardRef.actions.undo());
  }

  protected async redo(): Promise<void> {
    await this.guard(() => this.boardRef.actions.redo());
  }

  /** 备份导出入口（US-537 编排由宿主接线；缺省展示占位提示）。 */
  protected async onExportBackup(): Promise<void> {
    const callback = this.exportBackup();
    if (callback) {
      await callback();
    } else {
      this.notice.set('备份导出由宿主接线（US-537）');
    }
  }

  /** 统一写入口错误反馈：失败保留输入并提示，不静默。 */
  protected dueDateText(task: Task): string {
    const due = task.dueDate;
    if (!due) return '';
    // 纯日期比较：早于本地今天才逾期、今天不逾期（US-539 AC#12）
    const today = this.today();
    return (
      due < today ? `已逾期 ${due}`
      : due === today ? `今天到期 ${due}`
      : due
    );
  }

  protected labelsOf(taskId: UUID): readonly import('@aiao/rxdb-plugin-board').BoardLabel[] {
    return this.board()?.taskLabels().get(taskId) ?? [];
  }

  // ---------- 板内搜索（US-539 阶段 B） ----------

  /** 输入变化：空查询销毁句柄退出搜索态；否则按防抖复用同一句柄。 */
  /** 切板：先切换，再销毁重建句柄重发当前查询（setQuery 同词会被 distinctUntilChanged 吞掉）。 */
  protected onBoardSelectionChange(event: Event): void {
    const selector = event.target as HTMLSelectElement;
    this.onSelectBoard(selector.value as UUID);
    selector.value = this.boardRef.currentBoardId() ?? '';
  }

  protected onSelectBoard(boardId: UUID): void {
    // 切板前确认是否放弃未保存修改。
    if (this.detailTaskId() !== null) {
      if (this.isDetailDirty() && !window.confirm('切板将放弃未保存的修改。继续？')) return;
      this.detailTaskId.set(null);
      this.snapshot = null;
    }
    this.invalidateDetailRequest();
    this.boardRef.selectBoard(boardId);
    const query = this.searchQuery().trim();
    if (query !== '') {
      this.destroySearch();
      this.onSearchInput(query);
    }
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    const query = value.trim();
    if (query === '') {
      this.destroySearch();
      return;
    }
    const source = this.board()?.searchSource;
    if (!source) return;
    if (this.searchHandle === null) {
      const handle = source.search(query);
      this.searchHandle = handle;
      // 上一组句柄订阅先退订（destroy 不保证上游 observable 不再发射）
      this.searchSubs.unsubscribe();
      this.searchSubs = new Subscription();
      this.searchSubs.add(handle.state$.subscribe(state => this.searchState.set(state)));
      this.searchSubs.add(handle.results$.subscribe(results => this.searchResults.set(results)));
      this.searchSubs.add(handle.hasMore$.subscribe(more => this.searchHasMore.set(more)));
      this.searchSubs.add(handle.error$.subscribe(error => this.searchErrorText.set(String(error))));
    } else {
      this.searchHandle.setQuery(query);
    }
  }

  protected onSearchMore(): void {
    if (this.searchState() === 'loading') return;
    void this.searchHandle?.loadMore();
  }

  /** 点结果：滚动到目标卡片并短暂高亮（更新中不可点）。 */
  protected onSearchResultClick(result: SearchResult): void {
    if (this.searchState() === 'loading') return;
    const area = this.boardArea()?.nativeElement;
    const taskElement = area?.querySelector<HTMLElement>(`[data-task-id="${result.id}"]`);
    taskElement?.scrollIntoView({ block: 'center' });
    const targetId = result.id as UUID;
    this.searchHighlightId.set(targetId);
    window.setTimeout(() => {
      if (this.searchHighlightId() === targetId) this.searchHighlightId.set(null);
    }, 2000);
  }

  protected searchColumnTitle(result: SearchResult): string {
    const task = this.board()
      ?.tasks()
      .find(candidate => candidate.id === (result.id as UUID));
    const column =
      task ?
        this.board()
          ?.columns()
          .find(candidate => candidate.id === task.columnId)
      : undefined;
    return column?.title ?? '';
  }

  protected searchResultTitle(result: SearchResult): string {
    return (
      this.board()
        ?.tasks()
        .find(candidate => candidate.id === (result.id as UUID))?.title ?? ''
    );
  }

  /** 落点反馈判定（模板用）。 */
  protected isDropBefore(task: Task): boolean {
    const target = this.dropTarget();
    return target?.kind === 'task' && target.taskId === task.id && target.mode === 'before';
  }

  protected isDropAfter(task: Task): boolean {
    const target = this.dropTarget();
    return target?.kind === 'task' && target.taskId === task.id && target.mode === 'after';
  }

  protected isDropEnd(column: Column): boolean {
    return this.dropTarget()?.kind === 'task-end' && this.dropTarget()?.columnId === column.id;
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

  protected searchUnavailableText(reason: BoardSearchUnavailableReason | null): string {
    return reason === 'plugin_not_installed' ? '搜索插件未安装'
      : reason === 'adapter_unsupported' ? '当前适配器不支持搜索'
      : reason === 'query_failed' ? '搜索查询失败'
      : '';
  }

  /** 恢复标记跨页同步：读 localStorage 标记并把门禁下发到领域桥。 */
  private readonly onBoardStorage = (): void => {
    this.board()?.setRestoring(
      typeof localStorage !== 'undefined' && localStorage.getItem(RESTORING_MARKER_KEY) !== null
    );
  };

  /** 帧循环内持续聚焦被移动卡片（提交与重渲染是异步的，固定时长内每帧重试）。 */
  private focusMovedCard(taskId: UUID, attempts = 60): void {
    const card = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    if (card !== null && card.isConnected) card.focus();
    if (attempts > 0) requestAnimationFrame(() => this.focusMovedCard(taskId, attempts - 1));
  }

  private async executeTaskMove(taskId: UUID, target: CardDropTarget): Promise<boolean> {
    const snapshot = this.detailTaskId() === taskId ? this.snapshot : null;
    this.notice.set(null);
    try {
      await this.boardRef.actions.moveTask(taskId, target);
    } catch (error) {
      this.notice.set(error instanceof Error ? error.message : String(error));
      this.scheduleNoticeClear();
      return false;
    }
    if (snapshot !== null && this.detailTaskId() === taskId && this.snapshot === snapshot) {
      this.snapshot = { ...snapshot, columnId: target.columnId };
    }
    return true;
  }

  private invalidateDetailRequest(): void {
    this.detailRequest++;
    this.pendingDetailTaskId = null;
  }

  private detailDraftState(): string {
    return JSON.stringify([
      this.detailDraftTitle(),
      this.draftDescription(),
      this.draftDueDate(),
      this.draftLabelIds()
    ]);
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

  private columnViews(area: HTMLElement): CardDropColumnView[] {
    return this.boardRef.columns().map(viewColumn => {
      const columnEl = area.querySelector<HTMLElement>(`[data-column-id="${viewColumn.id}"]`);
      const rect = columnEl?.getBoundingClientRect();
      const cards = (this.taskMap().get(viewColumn.id) ?? [])
        .map(task => {
          const cardEl = area.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
          const cardRect = cardEl?.getBoundingClientRect();
          return cardRect ? { id: task.id, top: cardRect.top, bottom: cardRect.bottom } : null;
        })
        .filter((card): card is { readonly id: UUID; readonly top: number; readonly bottom: number } => card !== null);
      return {
        columnId: viewColumn.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: (this.taskMap().get(viewColumn.id) ?? []).map(task => task.id)
      };
    });
  }

  private columnRect(columnId: UUID): { readonly left: number; readonly right: number } {
    const header = this.boardArea()?.nativeElement.querySelector<HTMLElement>(`[data-column-header-id="${columnId}"]`);
    const rect = header?.getBoundingClientRect();
    return { left: rect?.left ?? 0, right: rect?.right ?? 0 };
  }

  private clearDragFeedback(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  private resolveTaskTarget(
    column: Column,
    movedId: UUID,
    clientX: number,
    clientY: number,
    area: HTMLElement
  ): CardDropTarget | null {
    return resolveCardDrop(this.columnViews(area), movedId, clientX, clientY);
  }

  private resolveColumnTarget(
    movedId: UUID,
    clientX: number,
    area: HTMLElement
  ): { readonly prevId: UUID | null; readonly nextId: UUID | null } | null {
    const views = this.boardRef.columns().map(column => {
      const headerEl = area.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    const target = resolveColumnDrop(
      views,
      this.boardRef.columns().map(column => column.id),
      movedId,
      clientX
    );
    return target ? { prevId: target.prevId as UUID, nextId: target.nextId as UUID } : null;
  }

  // ---------- 本列排序 / 移动（键盘等价路径） ----------

  private async guard<T>(operation: () => Promise<T>): Promise<T | undefined> {
    try {
      this.notice.set(null);
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.notice.set(message);
      this.scheduleNoticeClear();
      return undefined;
    }
  }

  /** 提示条 5 秒自动消退（GitHub 风格）；新提示重置计时。 */
  private scheduleNoticeClear(): void {
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.notice.set(null), 5000);
  }


  private localToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private readonly onTodayActivity = (): void => {
    this.today.set(this.localToday());
    if (this.todayTimer !== null) window.clearTimeout(this.todayTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    this.todayTimer = window.setTimeout(this.onTodayActivity, Math.max(nextMidnight - now.getTime() + 1, 1000));
  };

}
