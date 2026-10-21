/**
 * @fileoverview `Worktree` 实体：检出位的登记表，只读检出位（US-313）与可写检出位（US-314）共用。
 *
 * @remarks
 * 本地、不进同步：检出位是这台设备上的一个视图，另一台设备上没有它的快照库或影子表。
 * 只读检出位的顺序不变量：先写登记行再建快照库，先删快照库再删登记行——崩溃后留下的永远是「有登记、库可能不全」，
 * 回收时按登记行找得到要删的库；反过来就会留下没人认领的库。
 * 可写检出位的登记行、分支表上的持有键与那套影子表都在主库里，同一笔事务里一起建、一起删，没有中间态。
 */

import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

/** 检出位的 HEAD 是一条分支，还是一个提交。 */
export type WorktreeKind = 'branch' | 'commit';

/**
 * 检出位能不能写。
 *
 * - `read_only`：独立的快照库，用第二个只读实例浏览（US-313）
 * - `writable`：同一个库里的一套影子表，主实例挂上它读写、提交（US-314）；HEAD 只能是分支
 */
export type WorktreeMode = 'read_only' | 'writable';

/** 检出位归谁：标签页会话（会话结束即可回收），或持久（刷新后还在）。 */
export type WorktreeOwner = 'session' | 'persistent';

/** 快照库是否已建完。 */
export type WorktreeState = 'building' | 'ready';

/**
 * 检出位的登记行。
 *
 * @remarks
 * 不声明任何关系：分支或提交被删时，只读检出位仍是一份建立时刻的快照，不该被外键级联带走；
 * 可写检出位丢了持有的分支就挂不上了，由 `prune()` 回收，也不靠外键。
 */
@Entity({
  namespace: 'rxdb',
  name: 'Worktree',
  tableName: 'rxdb_worktree',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'mode', type: PropertyType.string },
    { name: 'kind', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'commitId', type: PropertyType.string, nullable: true },
    { name: 'sourceBranchId', type: PropertyType.string, nullable: true },
    { name: 'sourceChangeId', type: PropertyType.integer, nullable: true },
    { name: 'targetChangeId', type: PropertyType.integer, nullable: true },
    { name: 'dbName', type: PropertyType.string, nullable: true },
    { name: 'tableSetSuffix', type: PropertyType.string, nullable: true },
    { name: 'name', type: PropertyType.string, nullable: true },
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

  /** 只读还是可写 */
  mode!: WorktreeMode;

  /** HEAD 的种类 */
  kind!: WorktreeKind;

  /** 分支视图是目标分支；提交视图是提交所在的分支 */
  branchId!: string;

  /** 提交视图的提交 id；分支视图为 `null` */
  commitId!: string | null;

  /** 建快照（可写检出位是播种）时主库的 active 分支；建完之前为 `null` */
  sourceBranchId!: string | null;

  /** 建快照（播种）时 active 分支停在哪条变更上；没有自有变更或建完之前为 `null` */
  sourceChangeId!: number | null;

  /** 快照（播种）停在目标分支的哪条变更上；没有自有变更或建完之前为 `null` */
  targetChangeId!: number | null;

  /** 快照库的逻辑库名（交给快照实例的 `dbName`），回收时按它找库；可写检出位没有快照库，为 `null` */
  dbName!: string | null;

  /** 可写检出位那套影子表的后缀（持有键由它推出）；只读检出位为 `null` */
  tableSetSuffix!: string | null;

  /** 名字（GitHub Desktop 的 Worktree name）；只读检出位为 `null` */
  name!: string | null;

  /** 归属 */
  owner!: WorktreeOwner;

  /** 是否已建完 */
  state!: WorktreeState;

  /** 复制的实体（可写检出位是那套表的成员）的结构指纹；应用的实体结构变了，持久的检出位就不能再直接打开 */
  schemaFingerprint!: string;

  /** 登记时间 */
  createdAt!: Date;

  /** 最后一次打开或刷新的时间 */
  lastAccessedAt!: Date;
}
