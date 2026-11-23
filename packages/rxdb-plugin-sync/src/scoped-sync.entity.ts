import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

/**
 * 一个分区的拉取进度：每个（实体、分支、分区、同步规则指纹）一行（US-033）
 *
 * @remarks
 * 先按 id 分页读业务表快照，读完之后游标跳到快照点，再从那里拉增量日志。
 * 规则指纹变了、远端身份变了或分区被撤销时，这一行连同它映射的本地行一起清掉。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBSyncBucketProgress',
  tableName: 'rxdb_sync_bucket_progress',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'namespace', type: PropertyType.string },
    { name: 'entity', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'bucket', type: PropertyType.string },
    { name: 'filterFingerprint', type: PropertyType.string },
    { name: 'snapshotPoint', type: PropertyType.integer },
    { name: 'snapshotAfterId', type: PropertyType.string, nullable: true },
    { name: 'cursor', type: PropertyType.integer, default: 0 },
    { name: 'snapshotComplete', type: PropertyType.boolean, default: false },
    { name: 'snapshotRunId', type: PropertyType.string },
    { name: 'remoteBackendId', type: PropertyType.string, nullable: true },
    { name: 'lastPulledAt', type: PropertyType.date, nullable: true },
    { name: 'createdAt', type: PropertyType.date, default: () => new Date() },
    { name: 'updatedAt', type: PropertyType.date, default: () => new Date() }
  ],
  indexes: [
    {
      name: 'scope',
      properties: ['namespace', 'entity', 'branchId', 'bucket', 'filterFingerprint'],
      unique: true
    },
    { name: 'repository', properties: ['namespace', 'entity', 'branchId'] }
  ]
})
export class RxDBSyncBucketProgress {
  /** 由作用域各字段算出的稳定 id */
  id!: string;
  /** 实体命名空间 */
  namespace!: string;
  /** 实体名 */
  entity!: string;
  /** 本地分支 */
  branchId!: string;
  /** 远端分区 */
  bucket!: string;
  /** 实体同步规则的指纹，见 `filterFingerprint()` */
  filterFingerprint!: string;
  /** 开始读快照时远端该分区的日志水位；快照读完后游标从这里接着拉增量 */
  snapshotPoint!: number;
  /** 快照已读到的最后一行 id（`String(row.id)`）；还没读过时为 `null` */
  snapshotAfterId!: string | null;
  /** 增量日志的游标：已应用到的最大远端日志 id */
  cursor!: number;
  /** 快照是否已读完 */
  snapshotComplete!: boolean;
  /** 本轮快照的标识；快照读完时没被这一轮碰到的映射行就是过期行 */
  snapshotRunId!: string;
  /** 进度所属的远端身份；远端换了就作废 */
  remoteBackendId!: string | null;
  /** 最近一次拉取时间 */
  lastPulledAt!: Date | null;
  /** 创建时间 */
  createdAt!: Date;
  /** 更新时间 */
  updatedAt!: Date;
}

/**
 * 本地行与分区的映射：一个本地实体行由哪些（分区、规则指纹）同步而来（US-033）
 *
 * @remarks
 * 一行可以同时属于多个分区。某个分区不再包含它时只删这条映射，没有任何映射、也没有待推变更时才删本地行。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBSyncBucketRow',
  tableName: 'rxdb_sync_bucket_row',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'namespace', type: PropertyType.string },
    { name: 'entity', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'bucket', type: PropertyType.string },
    { name: 'filterFingerprint', type: PropertyType.string },
    { name: 'entityId', type: PropertyType.string },
    { name: 'snapshotRunId', type: PropertyType.string, nullable: true }
  ],
  indexes: [
    {
      name: 'scope_entity',
      properties: ['namespace', 'entity', 'branchId', 'bucket', 'filterFingerprint', 'entityId'],
      unique: true
    },
    { name: 'entity', properties: ['namespace', 'entity', 'branchId', 'entityId'] }
  ]
})
export class RxDBSyncBucketRow {
  /** 由作用域各字段与实体 id 算出的稳定 id */
  id!: string;
  /** 实体命名空间 */
  namespace!: string;
  /** 实体名 */
  entity!: string;
  /** 本地分支 */
  branchId!: string;
  /** 远端分区 */
  bucket!: string;
  /** 实体同步规则的指纹 */
  filterFingerprint!: string;
  /** 实体 id 的身份键（`getRxDBEntityIdentityKey()`） */
  entityId!: string;
  /** 最近一次在快照里见到它的快照标识；只由增量写入时为 `null` */
  snapshotRunId!: string | null;
}

/**
 * 本地库绑定的同步身份：单行，第一次与远端交换数据时写下（US-033）
 *
 * @remarks
 * 之后每次同步都核对，身份变了就停止同步并抛 `IdentityMismatchError`，没有改绑。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBSyncIdentityBinding',
  tableName: 'rxdb_sync_identity_binding',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'identityKind', type: PropertyType.string },
    { name: 'identityFingerprint', type: PropertyType.string },
    { name: 'createdAt', type: PropertyType.date, default: () => new Date() },
    { name: 'updatedAt', type: PropertyType.date, default: () => new Date() }
  ]
})
export class RxDBSyncIdentityBinding {
  /** 固定为 `'singleton'` */
  id!: string;
  /** 绑定身份的种类 */
  identityKind!: 'anon' | 'user';
  /** 绑定身份的指纹，见 `identityFingerprint()` */
  identityFingerprint!: string;
  /** 创建时间 */
  createdAt!: Date;
  /** 更新时间 */
  updatedAt!: Date;
}
