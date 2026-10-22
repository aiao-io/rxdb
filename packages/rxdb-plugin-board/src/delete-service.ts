import { assertEntityOperationAllowed, type RxDB, type UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

import { BoardLabel } from './entities/board-label.entity.js';
import { Board } from './entities/board.entity.js';
import { Column } from './entities/column.entity.js';
import { TaskLabel } from './entities/task-label.entity.js';
import { Task } from './entities/task.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, requireBoardId, type BoardHostContext } from './host-context.js';
import { inRule, readFirst, whereEq } from './query.js';

/**
 * 删除服务（US-534）：确认在事务外、删除集合在事务内复核。
 *
 * @remarks
 * 产品语义：先计算包含行 ID 的删除清单并等待确认（不持有事务），确认后
 * `adapter.transaction(executor => ...)` 重读目标及全部依赖行、比较已确认的 ID 集合，
 * 任何变化都 `confirm_stale` 零写退出并重新确认。子先父后的删除顺序既满足
 * 非空外键的 RESTRICT，也让撤销能按原 ID 插回（引擎按变更 id 降序生成插入，
 * 先插父、后插子，不撞外键——US-534 AC#11）。
 * 全部实体变更走 executor 仓储并保留默认事务日志与 `RxDBChange`。
 */

/** 任务删除清单。 */
export interface TaskDeletePlan {
  readonly kind: 'task';
  readonly taskId: UUID;
  /** 确认时展示的任务标题。 */
  readonly taskTitle: string;
  readonly taskLabelIds: readonly UUID[];
}

/** 列删除清单。 */
export interface ColumnDeletePlan {
  readonly kind: 'column';
  readonly columnId: UUID;
  readonly columnTitle: string;
  readonly taskIds: readonly UUID[];
  readonly taskLabelIds: readonly UUID[];
}

/** 板删除清单。 */
export interface BoardDeletePlan {
  readonly kind: 'board';
  readonly boardId: UUID;
  readonly boardTitle: string;
  readonly columnIds: readonly UUID[];
  readonly taskIds: readonly UUID[];
  readonly taskLabelIds: readonly UUID[];
  readonly boardLabelIds: readonly UUID[];
}

export type DeletePlan = TaskDeletePlan | ColumnDeletePlan | BoardDeletePlan;

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === new Set(b).size && a.every(id => b.includes(id));

export class BoardDeleteService {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext
  ) {}

  /** 任务删除清单（事务外读取，不持有事务）。 */
  async planTaskDelete(taskId: UUID): Promise<TaskDeletePlan> {
    assertBoardWritable(this.ctx());
    const tasks = await readFirst(this.rxdb.entityManager.getRepository(Task).find({ where: whereEq('id', taskId) }));
    if (tasks.length === 0) throw new BoardDomainError('task_not_found', `任务不存在：${taskId}`);
    const task = tasks[0];
    const columns = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', task.columnId) })
    );
    if (columns.length === 0 || columns[0].boardId !== requireBoardId(this.ctx())) {
      throw new BoardDomainError('cross_board', '任务不属于当前看板');
    }
    const labels = await readFirst(
      this.rxdb.entityManager.getRepository(TaskLabel).find({ where: whereEq('taskId', taskId) })
    );
    return {
      kind: 'task',
      taskId,
      taskTitle: task.title,
      taskLabelIds: labels.map(row => row.id)
    };
  }

  /** 列删除清单（事务外读取）。 */
  async planColumnDelete(columnId: UUID): Promise<ColumnDeletePlan> {
    assertBoardWritable(this.ctx());
    const columns = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', columnId) })
    );
    if (columns.length === 0) throw new BoardDomainError('column_not_found', `列不存在：${columnId}`);
    if (columns[0].boardId !== requireBoardId(this.ctx())) {
      throw new BoardDomainError('cross_board', '列不属于当前看板');
    }
    const tasks = await readFirst(
      this.rxdb.entityManager.getRepository(Task).find({ where: whereEq('columnId', columnId) })
    );
    const taskIds = tasks.map(task => task.id);
    const labels =
      taskIds.length === 0 ?
        []
      : await readFirst(
          this.rxdb.entityManager
            .getRepository(TaskLabel)
            .find({ where: { combinator: 'and', rules: [inRule('taskId', taskIds)] } })
        );
    return {
      kind: 'column',
      columnId,
      columnTitle: columns[0].title,
      taskIds,
      taskLabelIds: labels.map(row => row.id)
    };
  }

  /** 板删除清单（事务外读取）。 */
  async planBoardDelete(boardId: UUID): Promise<BoardDeletePlan> {
    assertBoardWritable(this.ctx());
    if (boardId !== requireBoardId(this.ctx())) {
      throw new BoardDomainError('cross_board', '看板不是当前看板');
    }
    const boards = await readFirst(
      this.rxdb.entityManager.getRepository(Board).find({ where: whereEq('id', boardId) })
    );
    if (boards.length === 0) throw new BoardDomainError('board_not_found', `看板不存在：${boardId}`);
    const columns = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', boardId) })
    );
    const columnIds = columns.map(column => column.id);
    const tasks =
      columnIds.length === 0 ?
        []
      : await readFirst(
          this.rxdb.entityManager
            .getRepository(Task)
            .find({ where: { combinator: 'and', rules: [inRule('columnId', columnIds)] } })
        );
    const taskIds = tasks.map(task => task.id);
    const taskLabels =
      taskIds.length === 0 ?
        []
      : await readFirst(
          this.rxdb.entityManager
            .getRepository(TaskLabel)
            .find({ where: { combinator: 'and', rules: [inRule('taskId', taskIds)] } })
        );
    const boardLabels = await readFirst(
      this.rxdb.entityManager.getRepository(BoardLabel).find({ where: whereEq('boardId', boardId) })
    );
    return {
      kind: 'board',
      boardId,
      boardTitle: boards[0].title,
      columnIds,
      taskIds,
      taskLabelIds: taskLabels.map(row => row.id),
      boardLabelIds: boardLabels.map(row => row.id)
    };
  }

  /** 事务内复核并执行删除；集合与清单不一致时零写退出（`confirm_stale`）。 */
  async executeDelete(plan: DeletePlan): Promise<void> {
    assertBoardWritable(this.ctx());
    // 权限在进入受信 executor 前用公开入口检查（US-534 技术笔记）
    assertEntityOperationAllowed(Task, 'delete');
    assertEntityOperationAllowed(TaskLabel, 'delete');
    if (plan.kind === 'task') return this.executeTaskDelete(plan);
    assertEntityOperationAllowed(Column, 'delete');
    if (plan.kind === 'column') return this.executeColumnDelete(plan);
    assertEntityOperationAllowed(Board, 'delete');
    assertEntityOperationAllowed(BoardLabel, 'delete');
    return this.executeBoardDelete(plan);
  }

  private async executeTaskDelete(plan: TaskDeletePlan): Promise<void> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    await adapter.transaction(async executor => {
      const tasks = await executor.getRepository(Task).find({ where: whereEq('id', plan.taskId) });
      if (tasks.length === 0) throw new BoardDomainError('confirm_stale', '任务已被删除，清单已过期');
      const task = tasks[0];
      const columns = await executor.getRepository(Column).find({ where: whereEq('id', task.columnId) });
      if (columns.length === 0 || columns[0].boardId !== requireBoardId(this.ctx())) {
        throw new BoardDomainError('cross_board', '任务不属于当前看板');
      }
      const labels = await executor.getRepository(TaskLabel).find({ where: whereEq('taskId', plan.taskId) });
      if (
        !sameSet(
          plan.taskLabelIds,
          labels.map(row => row.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '任务标签关联已变化，请重新确认');
      }
      for (const label of labels) await executor.getRepository(TaskLabel).remove(label);
      await executor.getRepository(Task).remove(tasks[0]);
    });
  }

  private async executeColumnDelete(plan: ColumnDeletePlan): Promise<void> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    await adapter.transaction(async executor => {
      const columns = await executor.getRepository(Column).find({ where: whereEq('id', plan.columnId) });
      if (columns.length === 0) throw new BoardDomainError('confirm_stale', '列已被删除，清单已过期');
      if (columns[0].boardId !== requireBoardId(this.ctx())) {
        throw new BoardDomainError('cross_board', '列不属于当前看板');
      }
      const tasks = await executor.getRepository(Task).find({ where: whereEq('columnId', plan.columnId) });
      if (
        !sameSet(
          plan.taskIds,
          tasks.map(task => task.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '列内任务已变化，请重新确认');
      }
      const taskIds = tasks.map(task => task.id);
      const labels =
        taskIds.length === 0 ?
          []
        : await executor
            .getRepository(TaskLabel)
            .find({ where: { combinator: 'and', rules: [inRule('taskId', taskIds)] } });
      if (
        !sameSet(
          plan.taskLabelIds,
          labels.map(row => row.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '任务标签关联已变化，请重新确认');
      }
      for (const label of labels) await executor.getRepository(TaskLabel).remove(label);
      for (const task of tasks) await executor.getRepository(Task).remove(task);
      await executor.getRepository(Column).remove(columns[0]);
    });
  }

  private async executeBoardDelete(plan: BoardDeletePlan): Promise<void> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    await adapter.transaction(async executor => {
      if (plan.boardId !== requireBoardId(this.ctx())) {
        throw new BoardDomainError('cross_board', '看板不是当前看板');
      }
      const boards = await executor.getRepository(Board).find({ where: whereEq('id', plan.boardId) });
      if (boards.length === 0) throw new BoardDomainError('confirm_stale', '看板已被删除，清单已过期');
      const columns = await executor.getRepository(Column).find({ where: whereEq('boardId', plan.boardId) });
      if (
        !sameSet(
          plan.columnIds,
          columns.map(column => column.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '板内列已变化，请重新确认');
      }
      const columnIds = columns.map(column => column.id);
      const tasks =
        columnIds.length === 0 ?
          []
        : await executor
            .getRepository(Task)
            .find({ where: { combinator: 'and', rules: [inRule('columnId', columnIds)] } });
      if (
        !sameSet(
          plan.taskIds,
          tasks.map(task => task.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '板内任务已变化，请重新确认');
      }
      const taskIds = tasks.map(task => task.id);
      const taskLabels =
        taskIds.length === 0 ?
          []
        : await executor
            .getRepository(TaskLabel)
            .find({ where: { combinator: 'and', rules: [inRule('taskId', taskIds)] } });
      if (
        !sameSet(
          plan.taskLabelIds,
          taskLabels.map(row => row.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '任务标签关联已变化，请重新确认');
      }
      const boardLabels = await executor.getRepository(BoardLabel).find({ where: whereEq('boardId', plan.boardId) });
      if (
        !sameSet(
          plan.boardLabelIds,
          boardLabels.map(row => row.id)
        )
      ) {
        throw new BoardDomainError('confirm_stale', '板级标签已变化，请重新确认');
      }
      for (const label of taskLabels) await executor.getRepository(TaskLabel).remove(label);
      for (const task of tasks) await executor.getRepository(Task).remove(task);
      for (const column of columns) await executor.getRepository(Column).remove(column);
      for (const label of boardLabels) await executor.getRepository(BoardLabel).remove(label);
      await executor.getRepository(Board).remove(boards[0]);
    });
  }
}

export type BoardEntity = InstanceType<typeof Board>;
export type ColumnEntity = InstanceType<typeof Column>;
export type TaskEntity = InstanceType<typeof Task>;
