import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  Injector,
  OnInit,
  runInInjectionContext,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Board,
  Column,
  Task,
  resolveCardDrop,
  resolveColumnDrop,
  type CardDropTarget,
  type TaskDraftSnapshot
} from '@aiao/rxdb-plugin-board';

import { useBoard, type UseBoardReturn } from './use-board.js';

/**
 * 看板视图组件（US-531 阶段 A）：列 + 卡片 + 拖拽 + 本列排序 + 详情面板 +
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
  templateUrl: './board-view.html'
})
export class BoardViewComponent implements OnInit {
  /** 已连接的看板 RxDB 实例（实体含 board 命名空间五实体，需历史插件）。 */
  readonly rxdb = input.required<Parameters<typeof useBoard>[0]>();

  /** 输入绑定完成后（ngOnInit）安装的领域桥；首帧为 null。 */
  protected readonly board = signal<UseBoardReturn | null>(null);

  private readonly injectorRef = inject(Injector);

  ngOnInit(): void {
    // 显式注入上下文：JIT + zoneless 下生命周期钩子不保证自带注入上下文
    const installed = runInInjectionContext(this.injectorRef, () => useBoard(this.rxdb()));
    this.board.set(installed);
  }

  protected get boardRef(): UseBoardReturn {
    const installed = this.board();
    if (!installed) throw new Error('board 尚未安装');
    return installed;
  }

  /** 正在拖拽的任务 / 列与指针轨迹。 */
  protected readonly dragging = signal<{
    readonly kind: 'task' | 'column';
    readonly id: string;
  } | null>(null);
  protected readonly dragPointer = signal<{ readonly x: number; readonly y: number }>({ x: 0, y: 0 });
  protected readonly detailTaskId = signal<string | null>(null);
  protected readonly confirmDelete = signal<
    | { readonly kind: 'task'; readonly taskId: string; readonly title: string }
    | { readonly kind: 'column'; readonly columnId: string; readonly title: string; readonly taskCount: number }
    | { readonly kind: 'board'; readonly boardId: string; readonly title: string; readonly columnCount: number; readonly taskCount: number }
    | null
  >(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly boardArea = viewChild<ElementRef<HTMLElement>>('boardArea');

  protected readonly taskMap = computed(() => {
    const grouped = new Map<string, Task[]>();
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

  protected async createTask(columnId: string): Promise<void> {
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

  protected async renameColumn(columnId: string): Promise<void> {
    const column = this.boardRef.columns().find(c => c.id === columnId);
    if (!column) return;
    const title = window.prompt('改列标题', column.title);
    if (title === null) return;
    await this.guard(() => this.boardRef.actions.updateColumn(columnId, { title }));
  }

  protected editTitle = signal<string | null>(null);

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
    event.dataTransfer?.setData('text/plain', task.id);
    this.dragging.set({ kind: 'task', id: task.id });
  }

  protected onTaskDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragPointer.set({ x: event.clientX, y: event.clientY });
  }

  protected onColumnDragStart(event: DragEvent, column: Column): void {
    event.dataTransfer?.setData('text/plain', column.id);
    this.dragging.set({ kind: 'column', id: column.id });
  }

  protected onColumnDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragPointer.set({ x: event.clientX, y: event.clientY });
  }

  protected async onTaskDrop(event: DragEvent, column: Column): Promise<void> {
    event.preventDefault();
    const movedId = event.dataTransfer?.getData('text/plain') ?? this.dragging()?.id;
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
    const movedId = event.dataTransfer?.getData('text/plain') ?? this.dragging()?.id;
    if (!movedId) return;
    this.dragging.set(null);
    const area = this.boardArea()?.nativeElement;
    if (!area) return;
    const target = this.resolveColumnTarget(movedId, event.clientX, area);
    if (!target) return;
    await this.guard(() => this.boardRef.actions.moveColumn(movedId, target));
  }

  private resolveTaskTarget(column: Column, movedId: string, clientX: number, clientY: number, area: HTMLElement): CardDropTarget | null {
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

  private resolveColumnTarget(movedId: string, clientX: number, area: HTMLElement): { readonly prevId: string | null; readonly nextId: string | null } | null {
    const views = this.boardRef.columns().map(column => {
      const headerEl = area.querySelector<HTMLElement>(`[data-column-header-id="${column.id}"]`);
      const rect = headerEl?.getBoundingClientRect();
      return { columnId: column.id, rect: { left: rect?.left ?? 0, right: rect?.right ?? 0 } };
    });
    return resolveColumnDrop(views, this.boardRef.columns().map(column => column.id), movedId, clientX);
  }

  // ---------- 本列排序 / 移动（键盘等价路径） ----------

  protected async sortColumnBy(columnId: string, mode: 'dueDate' | 'title'): Promise<void> {
    const result = await this.guard(() => this.boardRef.actions.sortColumn(columnId, mode));
    if (result && !result.written) this.notice.set('已按目标顺序排列，无变化');
  }

  protected async moveColumnBy(columnId: string, direction: -1 | 1): Promise<void> {
    const ids = this.boardRef.columns().map(column => column.id);
    const index = ids.indexOf(columnId);
    if (index < 0) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    const target = direction < 0 ?
      { prevId: ids[targetIndex - 1] ?? null, nextId: ids[targetIndex] }
    : { prevId: ids[targetIndex], nextId: ids[targetIndex + 1] ?? null };
    await this.guard(() => this.boardRef.actions.moveColumn(columnId, target));
  }

  // ---------- 详情面板 ----------

  protected readonly draftTitle = signal<string>('');
  protected readonly draftDescription = signal<string>('');
  protected readonly draftDueDate = signal<string>('');
  protected readonly draftLabelIds = signal<readonly string[]>([]);
  private snapshot: TaskDraftSnapshot | null = null;

  protected async openDetail(taskId: string): Promise<void> {
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
    await this.guard(() =>
      this.boardRef.actions.saveTaskDraft(taskId, this.snapshot!, {
        title: this.draftTitle(),
        description: this.draftDescription(),
        dueDate: this.draftDueDate() === '' ? null : this.draftDueDate(),
        labelIds: this.draftLabelIds()
      })
    );
    this.closeDetail();
  }

  protected toggleDraftLabel(labelId: string): void {
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

  protected async renameLabel(labelId: string): Promise<void> {
    const label = this.boardRef.labels().find(item => item.id === labelId);
    if (!label) return;
    const name = window.prompt('改标签名', label.name);
    if (name === null) return;
    await this.guard(() => this.boardRef.actions.renameLabel(labelId, name));
  }

  protected async deleteLabel(labelId: string): Promise<void> {
    const plan = await this.boardRef.actions.planLabelDelete(labelId);
    const confirmed = window.confirm(`删除标签「${plan.labelName}」？将移除 ${plan.taskLabelIds.length} 条任务关联。`);
    if (!confirmed) return;
    await this.guard(() => this.boardRef.actions.executeLabelDelete(plan));
  }

  // ---------- 删除确认（确认在事务外、集合在事务内复核） ----------

  protected async confirmTaskDelete(task: Task): Promise<void> {
    const plan = await this.boardRef.actions.planTaskDelete(task.id);
    this.confirmDelete.set({ kind: 'task', taskId: task.id, title: plan.taskTitle });
  }

  protected async confirmColumnDelete(column: Column): Promise<void> {
    const plan = await this.boardRef.actions.planColumnDelete(column.id);
    this.confirmDelete.set({ kind: 'column', columnId: column.id, title: plan.columnTitle, taskCount: plan.taskIds.length });
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

  /** 备份导出入口（US-529 编排由宿主接线；本组件只暴露占位回调）。 */
  protected async exportBackup(): Promise<void> {
    this.notice.set('备份导出由宿主接线（US-529）');
  }

  /** 统一写入口错误反馈：失败保留输入并提示，不静默。 */
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

  protected dueDateText(task: Task): string {
    const due = task.dueDate;
    if (!due) return '';
    // 纯日期比较：早于本地今天才逾期、今天不逾期（US-531 AC#12）
    const today = this.localToday();
    return due < today ? `已逾期 ${due}` : due === today ? `今天到期` : due;
  }

  private localToday(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  protected readonly labelsOf = (taskId: string): readonly import('@aiao/rxdb-plugin-board').BoardLabel[] =>
    this.board()?.taskLabels().get(taskId) ?? [];
}
