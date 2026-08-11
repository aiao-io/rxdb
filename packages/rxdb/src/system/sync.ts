/**
 * @fileoverview RxDBSync 实体定义
 * 用于追踪每个 repository 在每个分支上的同步状态
 */

import { Observable } from 'rxjs';
import { Entity } from '../entity/entity.decorator.js';
import { OnDeleteAction, PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { RxDBBranch } from './branch.js';
import { RxDBSyncOrderByField, RxDBSyncRuleGroup } from './types.js';

/**
 * Repository 同步元数据表
 *
 * 追踪每个 repository 在每个分支上的同步状态，包括：
 * - 同步类型（full/remote/local/none）
 * - 最后推送/拉取时间
 * - 最后推送/拉取的 changeId
 * - 是否启用同步
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBSync',
  tableName: 'rxdb_sync',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'namespace',
      type: PropertyType.string
    },
    {
      name: 'entity',
      type: PropertyType.string
    },
    {
      name: 'syncType',
      type: PropertyType.string,
      default: 'none'
    },
    {
      name: 'lastPushedChangeId',
      type: PropertyType.integer,
      nullable: true
    },
    {
      name: 'lastPushedAt',
      type: PropertyType.date,
      nullable: true
    },
    {
      name: 'lastPulledAt',
      type: PropertyType.date,
      nullable: true
    },
    {
      name: 'lastPullRemoteChangeId',
      type: PropertyType.integer,
      nullable: true
    },
    {
      name: 'enabled',
      type: PropertyType.boolean,
      default: true
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    },
    {
      name: 'updatedAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    }
  ],
  indexes: [
    {
      name: 'idx_repo_sync_branch',
      properties: ['branchId']
    },
    {
      name: 'idx_repo_sync_entity',
      properties: ['namespace', 'entity', 'branchId'],
      unique: true
    },
    {
      name: 'idx_repo_sync_type',
      properties: ['syncType', 'branchId']
    }
  ],
  relations: [
    {
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'syncs',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class RxDBSync {
  /**
   * 主键ID
   * 格式: {namespace}:{entity}:{branchId}
   * @example "public:Todo:main"
   */
  id!: string;

  /**
   * 实体命名空间
   * @example "public"
   */
  namespace!: string;

  /**
   * 实体名称
   * @example "Todo"
   */
  entity!: string;

  /**
   * 所属分支ID
   */
  branchId!: string;

  /**
   * 同步类型
   * - full: 本地 ↔ 远程完全同步
   * - filter: 本地 ↔ 远程条件同步（只同步满足条件的数据）
   * - querycache: 查询缓存同步（根据查询结果集进行本地缓存与远程数据的一致性维护）
   * - remote: 只读远程数据（只 pull，不 push）
   * - local: 只在本地（只 push，不 pull）
   * - none: 不同步（系统表或临时数据）
   */
  syncType!: 'full' | 'filter' | 'querycache' | 'remote' | 'local' | 'none';

  /**
   * 最后推送的本地 changeId
   */
  lastPushedChangeId!: number | null;

  /**
   * 最后推送时间
   */
  lastPushedAt!: Date | null;

  /**
   * 最后拉取时间
   */
  lastPulledAt!: Date | null;

  /**
   * 最后拉取的远程 changeId
   */
  lastPullRemoteChangeId!: number | null;

  /**
   * 是否启用同步（手动禁用开关）
   */
  enabled!: boolean;

  /**
   * 创建时间
   */
  createdAt!: Date;

  /**
   * 更新时间
   */
  updatedAt!: Date;

  /**
   * 关联分支
   */
  branch?: RxDBBranch;

  // 静态方法（由 EntityManager 自动注入）
  declare static find: (
    options: FindOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ) => Observable<RxDBSync[]>;

  declare static findAll: (
    options: FindAllOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ) => Observable<RxDBSync[]>;

  declare static findOne: (
    options: FindOneOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ) => Observable<RxDBSync | null>;

  declare static findOneOrFail: (
    options: FindOneOrFailOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ) => Observable<RxDBSync>;

  declare static findByCursor: (
    options: FindByCursorOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ) => Observable<RxDBSync[]>;

  declare static count: (options: CountOptions<typeof RxDBSync, RxDBSyncRuleGroup>) => Observable<number>;

  /**
   * 删除
   */
  declare remove: () => Promise<RxDBSync>;
  /**
   * 重置数据
   */
  declare reset: () => void;
  /**
   * 保存
   */
  declare save: () => Promise<RxDBSync>;
}
