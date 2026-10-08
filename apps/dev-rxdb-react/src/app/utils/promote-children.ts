import { getEntityMutations, type RxDB } from '@aiao/rxdb';
import type { ITreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * 「删除并提升子节点」的一次提交：子节点改挂到被删节点的父节点，被删节点同事务移除。
 *
 * @remarks
 * 子节点只改 `parentId`，不碰 `sortOrder`：引擎在事务里把它们追加到新父节点组的末尾。
 * 读取子节点是调用方的事，必须按 `parentId` 从库里取，而不是用页面已加载的节点。
 *
 * @param rxdb - 提交所用的 RxDB 实例
 * @param deleted - 被删除的节点
 * @param children - 被删节点在库里的直接子节点
 * @throws 提交失败时原样抛出，整批回滚
 */
export async function promoteChildrenAndRemove<T extends ITreeEntity>(
  rxdb: RxDB,
  deleted: T,
  children: T[]
): Promise<void> {
  for (const child of children) child.parentId = deleted.parentId;
  await rxdb.entityManager.mutations(getEntityMutations({ needSaveEntities: children, needRemoveEntities: [deleted] }));
}
