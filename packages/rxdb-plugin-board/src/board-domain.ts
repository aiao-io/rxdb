import { type RxDB, type UUID } from '@aiao/rxdb';

import { Board } from './entities/board.entity.js';
import { Column } from './entities/column.entity.js';
import { Task } from './entities/task.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, type BoardHostContext, requireBoardId } from './host-context.js';
import { readFirst, whereEq } from './query.js';
import { normalizeBoardTitle } from './title.js';

/**
 * 看板领域服务（US-526）：建板 / 建列 / 建任务与改名入口。
 *
 * @remarks
 * 创建一律走门面仓储（自动按组追加 `sortOrder`、过 US-027 操作权限判定）；
 * 结构归属规则（`column.board_id` 创建后不可改、任务只可属当前板、任务创建的目标列
 * 必须属于当前板）由本服务入口校验——直连 SQL 与适配器接口是受信维护入口，
 * 只由外键守引用存在性，本服务不承诺在那里拒绝归属改写（US-526 技术笔记）。
 * 每个实例绑定一个 RxDB 与一个宿主上下文。
 */
export class BoardDomain {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext
  ) {}

  /** 建板：标题去首尾空白后必填，描述可选。 */
  async createBoard(input: { title: string; description?: string }): Promise<InstanceType<typeof Board>> {
    assertBoardWritable(this.ctx());
    const title = this.requireTitle(input.title);
    const repository = this.rxdb.entityManager.getRepository(Board);
    return repository.create(
      this.rxdb.entityManager.instantiate(Board, {
        title,
        description: input.description ?? null
      })
    );
  }

  /** 建列：列归属当前板，追加到板内列序末尾。 */
  async createColumn(input: { title: string }): Promise<InstanceType<typeof Column>> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const title = this.requireTitle(input.title);
    await this.requireBoard(boardId);
    const repository = this.rxdb.entityManager.getRepository(Column);
    return repository.create(this.rxdb.entityManager.instantiate(Column, { boardId, title }));
  }

  /** 建任务：目标列必须存在且属于当前板，追加到列尾。 */
  async createTask(input: { columnId: UUID; title: string }): Promise<InstanceType<typeof Task>> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const title = this.requireTitle(input.title);
    const column = await this.requireColumnInBoard(input.columnId, boardId);
    const repository = this.rxdb.entityManager.getRepository(Task);
    return repository.create(this.rxdb.entityManager.instantiate(Task, { columnId: column.id, title }));
  }

  /** 改板标题 / 描述：只写给定字段，不接受归属字段。 */
  async updateBoard(boardId: UUID, patch: { title?: string; description?: string }): Promise<InstanceType<typeof Board>> {
    assertBoardWritable(this.ctx());
    const board = await this.requireBoard(boardId);
    const next: Partial<InstanceType<typeof Board>> = {};
    if (patch.title !== undefined) next.title = this.requireTitle(patch.title);
    if (patch.description !== undefined) next.description = patch.description;
    return this.rxdb.entityManager.getRepository(Board).update(board, next);
  }

  /** 改列标题：只写标题，不提供归属字段（`column.board_id` 创建后不可改）。 */
  async updateColumn(columnId: UUID, patch: { title: string }): Promise<InstanceType<typeof Column>> {
    assertBoardWritable(this.ctx());
    const column = await this.requireColumnInBoard(columnId, requireBoardId(this.ctx()));
    return this.rxdb.entityManager.getRepository(Column).update(column, { title: this.requireTitle(patch.title) });
  }

  /** 内联 / 详情共用：改任务标题，只写标题（US-528 内联编辑只提交标题）。 */
  async updateTaskTitle(taskId: UUID, title: string): Promise<InstanceType<typeof Task>> {
    assertBoardWritable(this.ctx());
    const task = await this.requireTaskInBoard(taskId, requireBoardId(this.ctx()));
    return this.rxdb.entityManager.getRepository(Task).update(task, { title: this.requireTitle(title) });
  }

  /** 当前板是否存在。 */
  async requireBoard(boardId: UUID): Promise<InstanceType<typeof Board>> {
    const found = await readFirst(this.rxdb.entityManager.getRepository(Board).find({ where: whereEq('id', boardId) }));
    if (found.length === 0) throw new BoardDomainError('board_not_found', `看板不存在：${boardId}`);
    return found[0];
  }

  /** 列存在且属于指定板（跨板任务归属与跨板移动都在这里拒绝）。 */
  async requireColumnInBoard(columnId: UUID, boardId: UUID): Promise<InstanceType<typeof Column>> {
    const found = await readFirst(this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('id', columnId) }));
    if (found.length === 0) throw new BoardDomainError('column_not_found', `列不存在：${columnId}`);
    if (found[0].boardId !== boardId) {
      throw new BoardDomainError('cross_board', '目标列不属于当前看板');
    }
    return found[0];
  }

  /** 任务存在且经所属列推导属于指定板。 */
  async requireTaskInBoard(taskId: UUID, boardId: UUID): Promise<InstanceType<typeof Task>> {
    const found = await readFirst(this.rxdb.entityManager.getRepository(Task).find({ where: whereEq('id', taskId) }));
    if (found.length === 0) throw new BoardDomainError('task_not_found', `任务不存在：${taskId}`);
    await this.requireColumnInBoard(found[0].columnId, boardId);
    return found[0];
  }

  /** 当前板全部任务（不分页）。 */
  async listTasksOfBoard(boardId: UUID): Promise<InstanceType<typeof Task>[]> {
    const columns = await readFirst(
      this.rxdb.entityManager.getRepository(Column).find({ where: whereEq('boardId', boardId) })
    );
    const columnIds = columns.map(column => column.id);
    if (columnIds.length === 0) return [];
    return readFirst(
      this.rxdb.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [{ field: 'columnId', operator: 'in', value: columnIds }] } })
    );
  }

  private requireTitle(raw: unknown): string {
    const title = normalizeBoardTitle(raw);
    if (title === null) throw new BoardDomainError('empty_title', '标题不能为空');
    return title;
  }
}
