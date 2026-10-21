import { type InstanceType, type RxDB } from '@aiao/rxdb';

import { Column } from './entities/column.entity.js';
import { Task } from './entities/task.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, type BoardHostContext, requireBoardId } from './host-context.js';
import { readFirst, whereEq } from './query.js';
import type { CardDropTarget } from './drop-resolution.js';
import { BoardWriteNotifier, describeBoardFailure } from './write-notifier.js';

/**
 * 移动服务（US-527）：跨列移动 / 同列改序 / 拖列。
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
  async moveTask(taskId: string, target: CardDropTarget): Promise<void> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const repository = this.rxdb.entityManager.getRepository(Task);
    try {
      // 源任务经所属列推导属于当前板；目标列存在且同板
      const tasks = await readFirst(repository.find({ where: whereEq('id', taskId) }));
      if (tasks.length === 0) throw new BoardDomainError('task_not_found', `任务不存在：${taskId}`);
      await this.requireColumnInBoard(tasks[0].columnId, boardId);
      await this.requireColumnInBoard(target.columnId, boardId);

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
    columnId: string,
    target: { readonly prevId: string | null; readonly nextId: string | null }
  ): Promise<void> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const repository = this.rxdb.entityManager.getRepository(Column);
    try {
      await this.requireColumnInBoard(columnId, boardId);
      await repository.reorder(columnId, target);
      this.notifier.next({ kind: 'column-move-committed', columnId });
    } catch (error) {
      this.notifier.next({ kind: 'column-move-failed', columnId, reason: describeBoardFailure(error) });
      throw error;
    }
  }

  private async requireColumnInBoard(columnId: string, boardId: string): Promise<InstanceType<typeof Column>> {
    const found = await readFirst(this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', columnId) }));
    if (found.length === 0) throw new BoardDomainError('column_not_found', `列不存在：${columnId}`);
    if (found[0].boardId !== boardId) {
      throw new BoardDomainError('cross_board', '目标列不属于当前看板');
    }
    return found[0];
  }
}
