import { assertEntityOperationAllowed, type InstanceType, type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

import { BoardLabel } from './entities/board-label.entity.js';
import { TaskLabel } from './entities/task-label.entity.js';
import { BoardDomainError } from './errors.js';
import { assertBoardWritable, type BoardHostContext, requireBoardId } from './host-context.js';
import { readFirst, whereEq } from './query.js';
import { normalizeBoardTitle } from './title.js';

/**
 * 板级标签服务（US-528）：创建 / 改名 / 改色 / 删除。
 *
 * @remarks
 * 标签是 board 级 1:N 定义 + 任务 N:M 引用。创建、改名、改色是独立显式操作；
 * 改名 / 改色立即反映到引用卡片（引用行不变，定义行变）。删除复用 US-526 的
 * 「确认在事务外、集合在事务内复核」流程：一次事务内删除标签及全部 `task_label`
 * 关联，失败整批回滚。标签名去首尾空白后非空、板内精确唯一（保留大小写），
 * 存储层唯一约束兜底并发竞态。
 */

/** 标签删除清单（确认在事务外读取）。 */
export interface LabelDeletePlan {
  readonly labelId: string;
  readonly labelName: string;
  readonly taskLabelIds: readonly string[];
}

export class BoardLabelService {
  constructor(
    private readonly rxdb: RxDB,
    private readonly ctx: () => BoardHostContext
  ) {}

  async createLabel(input: { name: string; color: string }): Promise<InstanceType<typeof BoardLabel>> {
    assertBoardWritable(this.ctx());
    const boardId = requireBoardId(this.ctx());
    const name = this.requireLabelName(input.name);
    await this.assertNameFree(boardId, name);
    const repository = this.rxdb.entityManager.getRepository(BoardLabel);
    try {
      return await repository.create(this.rxdb.entityManager.instantiate(BoardLabel, { boardId, name, color: input.color }));
    } catch (error) {
      // 并发竞态兜底：唯一约束已拒绝，翻查确认后给可判别错误码
      await this.assertNameFree(boardId, name);
      throw error;
    }
  }

  async renameLabel(labelId: string, name: string): Promise<InstanceType<typeof BoardLabel>> {
    assertBoardWritable(this.ctx());
    const label = await this.requireLabelInBoard(labelId);
    const next = this.requireLabelName(name);
    await this.assertNameFree(label.boardId, next, labelId);
    return this.rxdb.entityManager.getRepository(BoardLabel).update(label, { name: next });
  }

  async recolorLabel(labelId: string, color: string): Promise<InstanceType<typeof BoardLabel>> {
    assertBoardWritable(this.ctx());
    const label = await this.requireLabelInBoard(labelId);
    return this.rxdb.entityManager.getRepository(BoardLabel).update(label, { color });
  }

  /** 删除清单：标签与全部关联行（事务外读取）。 */
  async planLabelDelete(labelId: string): Promise<LabelDeletePlan> {
    assertBoardWritable(this.ctx());
    const label = await this.requireLabelInBoard(labelId);
    const links = await readFirst(this.rxdb.entityManager.getRepository(TaskLabel).find({ where: whereEq('labelId', labelId) }));
    return { labelId, labelName: label.name, taskLabelIds: links.map(link => link.id) };
  }

  /** 事务内复核并删除：集合变化零写退出；先清关联再删定义，失败整批回滚。 */
  async executeLabelDelete(plan: LabelDeletePlan): Promise<void> {
    assertBoardWritable(this.ctx());
    assertEntityOperationAllowed(TaskLabel, 'delete');
    assertEntityOperationAllowed(BoardLabel, 'delete');
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    await adapter.transaction(async executor => {
      const labels = await executor.getRepository(BoardLabel).find({ where: whereEq('id', plan.labelId) });
      if (labels.length === 0) throw new BoardDomainError('confirm_stale', '标签已被删除，清单已过期');
      const links = await executor.getRepository(TaskLabel).find({ where: whereEq('labelId', plan.labelId) });
      const sameSet =
        plan.taskLabelIds.length === links.length && plan.taskLabelIds.every(id => links.some(link => link.id === id));
      if (!sameSet) throw new BoardDomainError('confirm_stale', '标签关联已变化，请重新确认');
      for (const link of links) await executor.getRepository(TaskLabel).remove(link);
      await executor.getRepository(BoardLabel).remove(labels[0]);
    });
  }

  /** 当前板全部标签（创建时间升序、同时刻按 id，US-528 三端对拍顺序）。 */
  async listLabels(): Promise<InstanceType<typeof BoardLabel>[]> {
    const boardId = requireBoardId(this.ctx());
    return readFirst(
      this.rxdb.entityManager
        .getRepository(BoardLabel)
        .find({ where: whereEq('boardId', boardId), orderBy: [{ field: 'createdAt', sort: 'asc' }, { field: 'id', sort: 'asc' }] })
    );
  }

  private async requireLabelInBoard(labelId: string): Promise<InstanceType<typeof BoardLabel>> {
    const boardId = requireBoardId(this.ctx());
    const found = await readFirst(this.rxdb.entityManager.getRepository(BoardLabel).find({ where: whereEq('id', labelId) }));
    if (found.length === 0) throw new BoardDomainError('label_not_found', `标签不存在：${labelId}`);
    if (found[0].boardId !== boardId) throw new BoardDomainError('cross_board', '标签不属于当前看板');
    return found[0];
  }

  private async assertNameFree(boardId: string, name: string, excludeId?: string): Promise<void> {
    const existing = await readFirst(
      this.rxdb.entityManager.getRepository(BoardLabel).find({ where: whereEq('boardId', boardId) })
    );
    if (existing.some(label => label.name === name && label.id !== excludeId)) {
      throw new BoardDomainError('duplicate_label', '同板已存在同名标签');
    }
  }

  private requireLabelName(raw: unknown): string {
    const name = normalizeBoardTitle(raw);
    if (name === null) throw new BoardDomainError('empty_title', '标签名不能为空');
    return name;
  }
}
