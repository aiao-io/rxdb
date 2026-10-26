/**
 * @fileoverview 「这套表管哪些实体」的判定（US-314 B2.1）：主表集什么都管，影子表集只管自己的成员。
 *
 * @remarks
 * 记日志却不进影子表集的实体（QueryCache 同步的实体）也会出现在变更日志、切分支的增量与合并的源变更里。
 * 它们按解析器落回主表：挂在可写检出位上照写，改的是主检出位的表，变更还记在主检出位的分支名下。
 * 播种、检出位里切分支、合并与合并预览都按这一份判定滤掉它们，各写一份迟早有一处漏滤。
 */

import {
  parseRxDBChangeKey,
  type RxDB,
  type SwitchVersionActions,
  type SwitchVersionChange,
  type WorktreeTableSet
} from '@aiao/rxdb';

/**
 * 一条变更（按命名空间与实体名）落不落在某套表里。
 *
 * @internal
 */
export type ChangeInTableSet = (namespace: string, entity: string) => boolean;

/**
 * 「这套表管哪些实体」的判定函数。
 *
 * @param rxdb - 实例，按命名空间与实体名查元数据
 * @param tableSet - 表集
 * @returns 主表集恒为真；影子表集只对自己的成员为真，查不到元数据的实体为假
 *
 * @internal
 */
export const table_set_scope = (rxdb: RxDB, tableSet: WorktreeTableSet): ChangeInTableSet => {
  if (tableSet.isMain) return () => true;
  return (namespace, entity) => {
    const metadata = rxdb.schemaManager.getEntityMetadata(entity, namespace);
    return metadata !== undefined && tableSet.has(metadata);
  };
};

/**
 * 增量只留这套表管的实体，判定见 {@link table_set_scope}。
 *
 * @param rxdb - 实例
 * @param actions - 切分支或播种的增量
 * @param tableSet - 要落进去的那套表
 * @returns 主表集原样返回；影子表集只含成员实体
 *
 * @internal
 */
export const keep_table_set_actions = (
  rxdb: RxDB,
  actions: SwitchVersionActions,
  tableSet: WorktreeTableSet
): SwitchVersionActions => {
  if (tableSet.isMain) return actions;
  const inScope = table_set_scope(rxdb, tableSet);
  const keep = (changes: Map<string, SwitchVersionChange>): Map<string, SwitchVersionChange> =>
    new Map(
      [...changes].filter(([key]) => {
        const [namespace, entity] = parseRxDBChangeKey(key);
        return inScope(namespace, entity);
      })
    );
  return { inserts: keep(actions.inserts), updates: keep(actions.updates), deletes: keep(actions.deletes) };
};
