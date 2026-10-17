/**
 * @fileoverview `Worktree` 实体：只读检出位的登记表（US-313）。
 *
 * @remarks
 * 本地、不进同步：检出位是这台设备上的一个视图，另一台设备上没有它的快照库。
 * 顺序不变量：先写登记行再建快照库，先删快照库再删登记行——崩溃后留下的永远是「有登记、库可能不全」，
 * 回收时按登记行找得到要删的库；反过来就会留下没人认领的库。
 */

import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

/** 检出位的 HEAD 是一条分支，还是一个提交。 */
export type WorktreeKind = 'branch' | 'commit';

/** 检出位归谁：标签页会话（会话结束即可回收），或持久（刷新后还在）。 */
export type WorktreeOwner = 'session' | 'persistent';

/** 快照库是否已建完。 */
export type WorktreeState = 'building' | 'ready';

/**
 * 只读检出位的登记行。
 *
 * @remarks
 * 不声明任何关系：分支或提交被删时，检出位仍是一份建立时刻的快照，不该被外键级联带走。
 */
@Entity({
  namespace: 'rxdb',
  name: 'Worktree',
  tableName: 'rxdb_worktree',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'kind', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'commitId', type: PropertyType.string, nullable: true },
    { name: 'sourceBranchId', type: PropertyType.string, nullable: true },
    { name: 'sourceChangeId', type: PropertyType.integer, nullable: true },
    { name: 'targetChangeId', type: PropertyType.integer, nullable: true },
    { name: 'dbName', type: PropertyType.string },
    { name: 'owner', type: PropertyType.string },
    { name: 'state', type: PropertyType.string },
    { name: 'schemaFingerprint', type: PropertyType.string },
    { name: 'createdAt', type: PropertyType.date },
    { name: 'lastAccessedAt', type: PropertyType.date }
  ]
})
export class Worktree {
  /** 检出位 id */
  id!: string;

  /** HEAD 的种类 */
  kind!: WorktreeKind;

  /** 分支视图是目标分支；提交视图是提交所在的分支 */
  branchId!: string;

  /** 提交视图的提交 id；分支视图为 `null` */
  commitId!: string | null;

  /** 建快照时主库的 active 分支；建完之前为 `null` */
  sourceBranchId!: string | null;

  /** 建快照时 active 分支停在哪条变更上；没有自有变更或建完之前为 `null` */
  sourceChangeId!: number | null;

  /** 快照停在目标分支的哪条变更上；没有自有变更或建完之前为 `null` */
  targetChangeId!: number | null;

  /** 快照库的逻辑库名（交给快照实例的 `dbName`）；回收时按它找库 */
  dbName!: string;

  /** 归属 */
  owner!: WorktreeOwner;

  /** 是否已建完 */
  state!: WorktreeState;

  /** 复制的实体的结构指纹；应用的实体结构变了，持久的快照就不能再直接打开 */
  schemaFingerprint!: string;

  /** 登记时间 */
  createdAt!: Date;

  /** 最后一次打开或刷新的时间 */
  lastAccessedAt!: Date;
}
