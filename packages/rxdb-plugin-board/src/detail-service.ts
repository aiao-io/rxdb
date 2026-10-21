import { assertEntityOperationAllowed, type RxDB, type UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

import { BoardLabel } from './entities/board-label.entity.js';
import { Column } from './entities/column.entity.js';
import { Task } from './entities/task.entity.js';
import { TaskLabel } from './entities/task-label.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, type BoardHostContext, requireBoardId } from './host-context.js';
import { inRule, readFirst, whereEq } from './query.js';
import { isValidDueDate, normalizeBoardTitle } from './title.js';

/**
 * 详情编辑服务（US-528）：草稿差集与一次保存。
 *
 * @remarks
 * 打开后只编辑内存草稿，选择已有标签也不立即写库；一次显式保存将标题、描述、
 * 截止日与标签关联差集放入同一个事务（同一个 `transactionId`，一次 undo 整体反转）。
 * 取消、Esc、关闭或未改变内容的保存均零写。事务内对照草稿打开时的快照复核待修改
 * 字段与标签引用：任务被删、被移动、字段或标签引用已被其它入口改变 → 整体拒绝、
 * 保留草稿要求刷新后重新确认（US-528 AC#15）。标签同板是领域校验：关联写入的
 * 同一事务内比较 `board_label` 的 board，不能仅靠下拉框过滤（AC#11）。
 */

/** 详情打开时的快照：保存时对照复核。 */
export interface TaskDraftSnapshot {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly columnId: UUID;
  readonly labelIds: readonly UUID[];
}

/** 详情草稿：打开后只编辑内存态。 */
export interface TaskDraft {
  readonly title: string;
  readonly description: string;
  readonly dueDate: string | null;
  readonly labelIds: readonly UUID[];
}

export type SaveTaskDraftResult =
  | { readonly kind: 'saved'; readonly task: InstanceType<typeof Task> }
  | { readonly kind: 'unchanged' };

const sameIdSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === b.length && a.every(id => b.includes(id));

export class BoardDetailService {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext
  ) {}

  /** 打开详情：读取当前状态作为快照（不持有事务）。 */
  async openSnapshot(taskId: UUID): Promise<TaskDraftSnapshot> {
    const boardId = requireBoardId(this.ctx());
    const tasks = await readFirst(this.rxdb.entityManager.getRepository(Task).find({ where: whereEq('id', taskId) }));
    if (tasks.length === 0) throw new BoardDomainError('task_not_found', `任务不存在：${taskId}`);
    const task = tasks[0];
    const columns = await readFirst(this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', task.columnId) }));
    if (columns.length === 0 || columns[0].boardId !== boardId) {
      throw new BoardDomainError('cross_board', '任务不属于当前看板');
    }
    const links = await readFirst(this.rxdb.entityManager.getRepository(TaskLabel).find({ where: whereEq('taskId', taskId) }));
    return {
      title: task.title,
      description: task.description ?? null,
      dueDate: task.dueDate ?? null,
      columnId: task.columnId,
      labelIds: links.map(link => link.labelId)
    };
  }

  /** 一次保存 = 一次事务：字段差集 + 标签关联差集原子提交；未改变内容零写。 */
  async saveTaskDraft(taskId: UUID, snapshot: TaskDraftSnapshot, draft: TaskDraft): Promise<SaveTaskDraftResult> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const title = normalizeBoardTitle(draft.title);
    if (title === null) throw new BoardDomainError('empty_title', '标题不能为空');
    if (draft.dueDate !== null && !isValidDueDate(draft.dueDate)) {
      throw new BoardDomainError('invalid_due_date', `截止日不是合法日期：${draft.dueDate}`);
    }
    // 空描述与 NULL 等价：未改动内容的保存零写（AC#9）
    const description = draft.description ? draft.description : null;
    assertEntityOperationAllowed(Task, 'update');
    assertEntityOperationAllowed(TaskLabel, 'create');
    assertEntityOperationAllowed(TaskLabel, 'delete');

    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const saved = await adapter.transaction(async executor => {
      const tasks = await executor.getRepository(Task).find({ where: whereEq('id', taskId) });
      if (tasks.length === 0) throw new BoardDomainError('task_stale', '任务已被删除，请刷新后重新确认');
      const task = tasks[0];

      const columns = await executor.getRepository(Column).find({ where: whereEq('id', task.columnId) });
      if (columns.length === 0 || columns[0].boardId !== boardId) {
        throw new BoardDomainError('cross_board', '任务不属于当前看板');
      }
      if (task.columnId !== snapshot.columnId) {
        throw new BoardDomainError('task_stale', '任务已被移动，请刷新后重新确认');
      }
      if (task.title !== snapshot.title || (task.description ?? null) !== snapshot.description || (task.dueDate ?? null) !== snapshot.dueDate) {
        throw new BoardDomainError('task_stale', '任务字段已被其它入口修改，请刷新后重新确认');
      }

      const currentLinks = await executor.getRepository(TaskLabel).find({ where: whereEq('taskId', taskId) });
      const currentIds = currentLinks.map(link => link.labelId);
      if (!sameIdSet(snapshot.labelIds, currentIds)) {
        throw new BoardDomainError('labels_changed', '标签引用已被其它入口修改，请刷新后重新确认');
      }
      const draftIds = [...new Set(draft.labelIds)];
      const labels =
        draftIds.length === 0 ? [] : await executor.getRepository(BoardLabel).find({ where: { combinator: 'and', rules: [inRule('id', draftIds)] } });
      const labelById = new Map(labels.map(label => [label.id, label]));
      for (const labelId of draftIds) {
        const label = labelById.get(labelId);
        if (!label) throw new BoardDomainError('label_not_found', `标签不存在：${labelId}`);
        if (label.boardId !== boardId) throw new BoardDomainError('label_cross_board', '只能引用当前看板的标签');
      }

      const toAdd = draftIds.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !draftIds.includes(id));

      let changed = false;
      if (task.title !== title || (task.description ?? null) !== description || (task.dueDate ?? null) !== draft.dueDate) {
        const patch: Partial<InstanceType<typeof Task>> = {};
        if (task.title !== title) patch.title = title;
        if ((task.description ?? null) !== description) patch.description = description;
        if ((task.dueDate ?? null) !== draft.dueDate) patch.dueDate = draft.dueDate;
        await executor.getRepository(Task).update(task, patch);
        changed = true;
      }
      for (const labelId of toAdd) {
        await executor
          .getRepository(TaskLabel)
          .create(this.rxdb.entityManager.instantiate(TaskLabel, { taskId, labelId }));
        changed = true;
      }
      for (const link of currentLinks) {
        if (toRemove.includes(link.labelId)) {
          await executor.getRepository(TaskLabel).remove(link);
          changed = true;
        }
      }
      return changed;
    });
    if (!saved) return { kind: 'unchanged' };
    const refreshed = await readFirst(this.rxdb.entityManager.getRepository(Task).find({ where: whereEq('id', taskId) }));
    return { kind: 'saved', task: refreshed[0] };
  }
}
