import {
  EntityLocalRemovedEvent,
  getEntityMetadata,
  type RxDB,
  RxDBChange,
  type RxDBEntityId,
  type RxDBEntityLocalRemovedEventData
} from '@aiao/rxdb';

/**
 * 不写变更日志的实体删行之后补派删除事件（US-222）。
 *
 * @param rxdb - 派事件的实例
 * @param entities - 刚删掉的实体（删行时手里就有的那几个）
 * @param recordAt - 事件时间
 *
 * @remarks
 * 写变更日志的实体，删除事件由变更行推导，带着 `inversePatch`。不写的表里，分支表与迁移表只有 `NOTIFY` 给的行号，
 * `handle_rxdb_change` 按行号回查行再派——删除时行已经没了，回查为空，活查询收不到（删分支之后分支列表照旧列着它）；
 * 其余的表连行号都没有。
 * 删行的两条路（批量写入、仓库的单删）手上都有被删的实体，直接派。在事务里派的事件由核心排进本事务的队列，
 * 提交才发出、回滚丢弃。`NOTIFY` 那条路因此跳过这些表的删除，不再自己派。
 *
 * 变更日志表自己除外：它的删除来自压缩与删分支，影响历史视图，不在这条修复里。
 */
export const dispatchUnloggedRemovals = (rxdb: RxDB, entities: Iterable<object>, recordAt: Date): void => {
  const changeMetadata = getEntityMetadata(RxDBChange);
  const events: RxDBEntityLocalRemovedEventData[] = [];
  for (const entity of entities) {
    const metadata = getEntityMetadata(entity);
    if (metadata.log !== false || metadata === changeMetadata) continue;
    events.push({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'DELETE',
      id: (entity as { id: RxDBEntityId }).id,
      patch: null,
      inversePatch: { ...entity },
      recordAt
    });
  }
  if (events.length > 0) rxdb.dispatchEvent(new EntityLocalRemovedEvent(events));
};
