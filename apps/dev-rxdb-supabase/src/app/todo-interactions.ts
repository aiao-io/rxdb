interface CompletableEntity {
  completed: boolean;
  save(): Promise<unknown>;
}

interface CompletedEntity {
  completed: boolean;
}

/**
 * 生成批量插入用的标题序列。
 *
 * @param total - 条数，必须是非负整数
 * @param batchId - 本批次标识，用于区分多次批量插入
 * @throws {@link Error} `total` 不是非负整数时
 */
export function createTodoBatchTitles(total: number, batchId: string): string[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('Todo batch size must be a non-negative integer');
  }
  return Array.from({ length: total }, (_, index) => `test-${batchId}-${index}`);
}

/**
 * 写入单条 todo 的完成状态，失败时把内存中的值回滚。
 *
 * @param entity - 目标实体
 * @param completed - 目标状态
 * @throws 透传 `save()` 的错误（回滚后再抛，不吞）
 */
export async function persistCompleted(entity: CompletableEntity, completed: boolean): Promise<void> {
  const previous = entity.completed;
  entity.completed = completed;
  try {
    await entity.save();
  } catch (error) {
    entity.completed = previous;
    throw error;
  }
}

/**
 * 批量写入完成状态，失败时逐条回滚到各自的原值。
 *
 * @param entities - 目标实体列表
 * @param completed - 目标状态
 * @param saveMany - 批量保存实现
 * @throws 透传 `saveMany()` 的错误（回滚后再抛，不吞）
 */
export async function persistCompletedBatch<T extends CompletedEntity>(
  entities: T[],
  completed: boolean,
  saveMany: (entities: T[]) => Promise<unknown>
): Promise<void> {
  const previous = entities.map(entity => entity.completed);
  entities.forEach(entity => {
    entity.completed = completed;
  });
  try {
    await saveMany(entities);
  } catch (error) {
    entities.forEach((entity, index) => {
      entity.completed = previous[index];
    });
    throw error;
  }
}
