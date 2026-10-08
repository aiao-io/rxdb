import { getEntityMutations, getEntityStatus, type RxDB } from '@aiao/rxdb';
import type { ITreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * 「删除并提升子节点」的一次提交：子节点改挂到被删节点的父节点，被删节点同事务移除。
 *
 * @remarks
 * 子节点只改 `parentId`，不碰 `sortOrder`：引擎在事务里把它们追加到新父节点组的末尾。
 * 读取子节点是调用方的事，必须按 `parentId` 从库里取，而不是用页面已加载的节点。
 *
 * 子节点是实体缓存里的共享引用：事务回滚只撤销库里的写，不撤销这里赋的 `parentId`。
 * 失败时把它退回提交前的值，否则下一次无关的保存会把这次失败的移动一并写进库。
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
  const previous = children.map(child => child.parentId);
  for (const child of children) child.parentId = deleted.parentId;
  try {
    await rxdb.entityManager.mutations(
      getEntityMutations({ needSaveEntities: children, needRemoveEntities: [deleted] })
    );
  } catch (error) {
    children.forEach((child, index) => restoreParentId(child, previous[index]));
    throw error;
  }
}

/** 退回本次改的 `parentId`：其余未保存编辑不动，`modified` 按剩余差异重算。 */
function restoreParentId(child: ITreeEntity, parentId: ITreeEntity['parentId']): void {
  child.parentId = parentId;
  const status = getEntityStatus(child);
  status.modified = Object.keys(status.patch).length > 0;
}
