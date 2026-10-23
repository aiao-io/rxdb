import { type RxDB, type UUID } from '@aiao/rxdb';

import type { CardDropTarget } from './drop-resolution.js';
import { Column } from './entities/column.entity.js';
import { Task } from './entities/task.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, type BoardHostContext, requireBoardId } from './host-context.js';
import { inRule, readFirst, whereEq } from './query.js';
import { BoardWriteNotifier, describeBoardFailure } from './write-notifier.js';

/**
 * 移动服务（US-535）：跨列移动 / 同列改序 / 拖列。
 *
 * @remarks
 * 领域服务先校验源列与目标列存在且同板，再由单卡 `Repository.reorder()` 在一个
 * 事务内只写 `columnId`（存储列 `column_id`）与 `sortOrder`；空列用
 * `{ group: { columnId } }` 目标。落库失败（`staleTarget` / `notFound` /
 * `PermissionDeniedError` 等）经 {@link BoardWriteNotifier} 发布失败原因并要求
 * 重查已提交数据，同时原样重抛——UI 据此恢复显示，不静默重试。
 */
export class BoardMoveService {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext,
    private readonly notifier: BoardWriteNotifier
  ) {}

  /** 单卡移动：目标来自 {@link resolveCardDrop} 的同一份换算表。 */
  async moveTask(taskId: UUID, target: CardDropTarget): Promise<void> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const repository = this.rxdb.entityManager.getRepository(Task);
    try {
      // 源任务经所属列推导属于当前板；目标列存在且同板
      const tasks = await readFirst(repository.find({ where: whereEq('id', taskId) }));
      if (tasks.length === 0) throw new BoardDomainError('task_not_found', `任务不存在：${taskId}`);
      await this.requireColumnInBoard(tasks[0].columnId, boardId);
      await this.requireColumnInBoard(target.columnId, boardId);
      if (target.kind === 'between') await this.requireNeighborsInColumn(target);

      const engineTarget =
        target.kind === 'end' ?
          { group: { columnId: target.columnId } }
        : { prevId: target.prevId, nextId: target.nextId };
      await repository.reorder(taskId, engineTarget);
      this.notifier.next({ kind: 'move-committed', taskId });
    } catch (error) {
      this.notifier.next({ kind: 'move-failed', taskId, reason: describeBoardFailure(error) });
      throw error;
    }
  }

  /** 拖列：板内列序重排（`boardId` 分组排序域）。 */
  async moveColumn(
    columnId: UUID,
    target: { readonly prevId: UUID | null; readonly nextId: UUID | null }
  ): Promise<void> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const repository = this.rxdb.entityManager.getRepository(Column);
    try {
      await this.requireColumnInBoard(columnId, boardId);
      await this.requireNeighborColumnsInBoard(target);
      await repository.reorder(columnId, target);
      this.notifier.next({ kind: 'column-move-committed', columnId });
    } catch (error) {
      this.notifier.next({ kind: 'column-move-failed', columnId, reason: describeBoardFailure(error) });
      throw error;
    }
  }

  /**
   * between 目标的邻居必须属于目标列：引擎的目标组由邻居决定，邻居来自异板列时
   * 会改写归属（跨板移动）。入口防线不承诺直连 SQL 也不可改，但领域服务要守住。
   */
  private async requireNeighborsInColumn(target: Extract<CardDropTarget, { readonly kind: 'between' }>): Promise<void> {
    const neighborIds = [target.prevId, target.nextId].filter((id): id is UUID => id !== null);
    if (neighborIds.length === 0) return;
    const neighbors = await readFirst(
      this.rxdb.entityManager.getRepository(Task).find({
        where: { combinator: 'and', rules: [inRule('id', neighborIds)] }
      })
    );
    const byId = new Map(neighbors.map(task => [task.id, task]));
    for (const id of neighborIds) {
      const task = byId.get(id);
      if (task === undefined) throw new BoardDomainError('task_not_found', `任务不存在：${id}`);
      if (task.columnId !== target.columnId) {
        throw new BoardDomainError('cross_board', '目标邻居不属于目标列');
      }
    }
  }

  /** 拖列目标的邻居列必须属于当前板（同 requireNeighborsInColumn 的归属防线）。 */
  private async requireNeighborColumnsInBoard(target: {
    readonly prevId: UUID | null;
    readonly nextId: UUID | null;
  }): Promise<void> {
    const neighborIds = [target.prevId, target.nextId].filter((id): id is UUID => id !== null);
    if (neighborIds.length === 0) return;
    const neighbors = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({
        where: { combinator: 'and', rules: [inRule('id', neighborIds)] }
      })
    );
    const byId = new Map(neighbors.map(column => [column.id, column]));
    const boardId = requireBoardId(this.ctx());
    for (const id of neighborIds) {
      const column = byId.get(id);
      if (column === undefined) throw new BoardDomainError('column_not_found', `列不存在：${id}`);
      if (column.boardId !== boardId) {
        throw new BoardDomainError('cross_board', '目标邻居列不属于当前看板');
      }
    }
  }

  private async requireColumnInBoard(columnId: UUID, boardId: UUID): Promise<InstanceType<typeof Column>> {
    const found = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', columnId) })
    );
    if (found.length === 0) throw new BoardDomainError('column_not_found', `列不存在：${columnId}`);
    if (found[0].boardId !== boardId) {
      throw new BoardDomainError('cross_board', '目标列不属于当前看板');
    }
    return found[0];
  }
}
