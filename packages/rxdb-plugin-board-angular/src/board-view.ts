import type { UUID } from '@aiao/rxdb';
import {
  Column,
  labelTextColor as pickLabelTextColor,
  resolveCardDrop,
  resolveColumnDrop,
  Task,
  type CardDropTarget,
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
  OnInit,
  runInInjectionContext,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';

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
        display: block;
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
      .board-connecting {
        padding: 2rem;
        color: #666;
      }
    `
  ]
})
export class BoardViewComponent implements OnInit {
  private readonly injectorRef = inject(Injector);

  /** 输入绑定完成后（ngOnInit）安装的领域桥；首帧为 null。 */
  private snapshot: TaskDraftSnapshot | null = null;

  protected readonly board = signal<UseBoardReturn | null>(null);

  /** 正在拖拽的任务 / 列与指针轨迹。 */
  protected readonly dragging = signal<{
    readonly kind: 'task' | 'column';
    readonly id: string;
  } | null>(null);
  protected readonly dragPointer = signal<{ readonly x: number; readonly y: number }>({ x: 0, y: 0 });
  protected readonly detailTaskId = signal<UUID | null>(null);
  protected readonly confirmDelete = signal<
    | { readonly kind: 'task'; readonly taskId: UUID; readonly title: string }
    | { readonly kind: 'column'; readonly columnId: UUID; readonly title: string; readonly taskCount: number }
    | {
        readonly kind: 'board';
        readonly boardId: UUID;
        readonly title: string;
        readonly columnCount: number;
        readonly taskCount: number;
      }
    | null
  >(null);
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

  protected readonly draftTitle = signal<string>('');
  protected readonly draftDescription = signal<string>('');
  protected readonly draftDueDate = signal<string>('');
  protected readonly draftLabelIds = signal<readonly UUID[]>([]);
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
    const installed = runInInjectionContext(this.injectorRef, () => useBoard(this.rxdb()));
    this.board.set(installed);
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

  protected async createTask(columnId: UUID): Promise<void> {
    const title = window.prompt('新建任务：标题');
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.createTask({ columnId, title }));
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
    this.draftTitle.set(task.title);
    this.editTitle.set(task.id);
  }

  protected async commitEditTitle(task: Task): Promise<void> {
    const value = this.draftTitle();
    this.editTitle.set(null);
    await this.guard(() => this.boardRef.actions.updateTaskTitle(task.id, value));
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
    event.preventDefault();
    this.dragPointer.set({ x: event.clientX, y: event.clientY });
  }

  protected onColumnDragStart(event: DragEvent, column: Column): void {
    event.dataTransfer?.setData('application/x-board-column', column.id);
    this.dragging.set({ kind: 'column', id: column.id });
  }

  protected onColumnDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragPointer.set({ x: event.clientX, y: event.clientY });
  }

  protected async onTaskDrop(event: DragEvent, column: Column): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-task') ?? this.dragging()?.id) as
      UUID | undefined;
    if (!movedId) return;
    this.dragging.set(null);
    const area = this.boardArea()?.nativeElement;
    if (!area) return;
    const target = this.resolveTaskTarget(column, movedId, event.clientX, event.clientY, area);
    if (!target) return;
    await this.guard(() => this.boardRef.actions.moveTask(movedId, target));
  }

  protected async onColumnDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const movedId = (event.dataTransfer?.getData('application/x-board-column') ?? this.dragging()?.id) as
      UUID | undefined;
    if (!movedId) return;
    this.dragging.set(null);
    const area = this.boardArea()?.nativeElement;
    if (!area) return;
    const target = this.resolveColumnTarget(movedId, event.clientX, area);
    if (!target) return;
    await this.guard(() => this.boardRef.actions.moveColumn(movedId, target));
  }

  protected async sortColumnBy(columnId: UUID, mode: 'dueDate' | 'title'): Promise<void> {
    const result = await this.guard(() => this.boardRef.actions.sortColumn(columnId, mode));
    if (result && !result.written) this.notice.set('已按目标顺序排列，无变化');
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
    const snap = await this.boardRef.actions.openSnapshot(taskId);
    this.snapshot = snap;
    this.detailTaskId.set(taskId);
    this.draftTitle.set(snap.title);
    this.draftDescription.set(snap.description ?? '');
    this.draftDueDate.set(snap.dueDate ?? '');
    this.draftLabelIds.set([...snap.labelIds]);
  }

  protected closeDetail(): void {
    this.detailTaskId.set(null);
    this.snapshot = null;
  }

  protected async saveDetail(): Promise<void> {
    const taskId = this.detailTaskId();
    if (!taskId || !this.snapshot) return;
    const result = await this.guard(() =>
      this.boardRef.actions.saveTaskDraft(taskId, this.snapshot!, {
        title: this.draftTitle(),
        description: this.draftDescription(),
        dueDate: this.draftDueDate() === '' ? null : this.draftDueDate(),
        labelIds: this.draftLabelIds()
      })
    );
    // 保存失败（空标题 / 非法日期 / 快照复核拒绝等）保留草稿，不关面板
    if (result === undefined) return;
    this.closeDetail();
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

  protected async deleteLabel(labelId: UUID): Promise<void> {
    const plan = await this.boardRef.actions.planLabelDelete(labelId);
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
    const plan = await this.boardRef.actions.planTaskDelete(task.id);
    this.confirmDelete.set({ kind: 'task', taskId: task.id, title: plan.taskTitle });
  }

  protected async confirmColumnDelete(column: Column): Promise<void> {
    const plan = await this.boardRef.actions.planColumnDelete(column.id);
    this.confirmDelete.set({
      kind: 'column',
      columnId: column.id,
      title: plan.columnTitle,
      taskCount: plan.taskIds.length
    });
  }

  protected async confirmBoardDelete(): Promise<void> {
    const current = this.boardRef.currentBoard();
    if (!current) return;
    const plan = await this.boardRef.actions.planBoardDelete(current.id);
    this.confirmDelete.set({
      kind: 'board',
      boardId: current.id,
      title: plan.boardTitle,
      columnCount: plan.columnIds.length,
      taskCount: plan.taskIds.length
    });
  }

  protected async executeConfirmedDelete(): Promise<void> {
    const pending = this.confirmDelete();
    if (!pending) return;
    this.confirmDelete.set(null);
    if (pending.kind === 'task') {
      const plan = await this.boardRef.actions.planTaskDelete(pending.taskId);
      await this.guard(() => this.boardRef.actions.executeDelete(plan));
    } else if (pending.kind === 'column') {
      const plan = await this.boardRef.actions.planColumnDelete(pending.columnId);
      await this.guard(() => this.boardRef.actions.executeDelete(plan));
    } else {
      const plan = await this.boardRef.actions.planBoardDelete(pending.boardId);
      await this.guard(() => this.boardRef.actions.executeDelete(plan));
    }
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
    const today = this.localToday();
    return (
      due < today ? `已逾期 ${due}`
      : due === today ? `今天到期`
      : due
    );
  }

  protected labelsOf(taskId: UUID): readonly import('@aiao/rxdb-plugin-board').BoardLabel[] {
    return this.board()?.taskLabels().get(taskId) ?? [];
  }

  private resolveTaskTarget(
    column: Column,
    movedId: UUID,
    clientX: number,
    clientY: number,
    area: HTMLElement
  ): CardDropTarget | null {
    const views = this.boardRef.columns().map(viewColumn => {
      const columnEl = area.querySelector<HTMLElement>(`[data-column-id="${viewColumn.id}"]`);
      const rect = columnEl?.getBoundingClientRect();
      const cards = (this.taskMap().get(viewColumn.id) ?? []).map(task => {
        const cardEl = area.querySelector<HTMLElement>(`[data-task-id="${task.id}"]`);
        const cardRect = cardEl?.getBoundingClientRect();
        return { id: task.id, top: cardRect?.top ?? 0, bottom: cardRect?.bottom ?? 0 };
      });
      return {
        columnId: viewColumn.id,
        rect: { left: rect?.left ?? 0, right: rect?.right ?? 0, top: rect?.top ?? 0, bottom: rect?.bottom ?? 0 },
        cards,
        taskIds: (this.taskMap().get(viewColumn.id) ?? []).map(task => task.id)
      };
    });
    return resolveCardDrop(views, movedId, clientX, clientY);
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
      return undefined;
    }
  }

  private localToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
