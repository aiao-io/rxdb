/**
 * @fileoverview 快照里有哪些实体：复制哪些表、克隆哪些类（US-313）。
 */

import type { EntityType, RxDB } from '@aiao/rxdb';
import { getEntityMetadata, getEntitySync, isSystemEntity, SyncType } from '@aiao/rxdb';
import { WorktreeUnavailableError } from './worktree-errors.js';

/**
 * 主实例上要复制进快照库的表：本地的业务表，含生成的类（多对多中间表、图的边）。
 *
 * @param rxdb - 主实例
 * @returns 主实例上的实体类
 *
 * @remarks
 * 去掉三类：系统表（快照实例有自己的一套）、QueryCache 实体（它们的表要 querycache、sync、远端插件一起才连得上）、
 * 只有远端一侧的实体（它们的数据不在主库里）。归属按 {@link getEntitySync} 判，与捕获判「是不是查询缓存」同一条规则。
 * 两侧都没声明的照常复制：存储插件的文件元数据就是这样，插件经库级本地适配器读写它，数据在主库里。
 */
export const worktreeCopiedEntities = (rxdb: RxDB): EntityType[] =>
  rxdb.config.entities.filter(EntityClass => {
    if (isSystemEntity(EntityClass)) return false;
    const sync = getEntitySync(EntityClass, rxdb.entitySync);
    if (sync?.type === SyncType.QueryCache) return false;
    return sync?.local !== undefined || sync?.remote === undefined;
  });

/**
 * 可写检出位那套影子表的成员：要复制的表里记变更日志的那些（US-314 B1.5）。
 *
 * @param rxdb - 主实例
 * @returns 主实例上的实体类，含生成的类（多对多中间表）
 *
 * @remarks
 * 关掉变更日志（`log: false`）的实体不进影子表：写进去的东西进不了历史，提交与切分支都看不见它；
 * 它们留在主表集里，各检出位共用一份（存储插件的文件元数据就是这样）。
 */
export const worktreeTableSetMembers = (rxdb: RxDB): EntityType[] =>
  worktreeCopiedEntities(rxdb).filter(EntityClass => getEntityMetadata(EntityClass).log !== false);

/**
 * 要克隆给快照实例的实体类：复制的表去掉生成的类。
 *
 * @param rxdb - 主实例
 * @param copied - {@link worktreeCopiedEntities} 的结果
 * @returns 主实例上的实体类
 *
 * @remarks
 * 生成的类由快照实例的 `SchemaManager` 自己再生成一份；把主实例那份也克隆过去，两份同名撞命名冲突。
 */
export const worktreeDeclaredEntities = (rxdb: RxDB, copied: readonly EntityType[]): EntityType[] => {
  const generated = new Set(rxdb.schemaManager.generatedEntities);
  return copied.filter(EntityClass => !generated.has(EntityClass));
};

/**
 * 主实例的实体类在快照实例上的对应类：同命名空间、同名。
 *
 * @param snapshot - 快照实例
 * @param EntityClass - 主实例上的实体类
 * @returns 快照实例上的实体类
 * @throws {@link WorktreeUnavailableError} `incomplete_entities`：快照实例上没有这个实体
 */
export const worktreeEntityOf = <T extends EntityType>(snapshot: RxDB, EntityClass: T): T => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  const counterpart = snapshot.schemaManager.getEntityType(name, namespace);
  if (counterpart === undefined) {
    throw new WorktreeUnavailableError(
      'incomplete_entities',
      `快照实例上没有 ${namespace}:${name}。生成它的插件要一并装进 worktrees.plugins`
    );
  }
  return counterpart as T;
};
