/**
 * @fileoverview 内部类型定义
 * system 目录下有一些内部表结构，这里主要为了让他们的 Repository 能够有静态类型支持
 *
 * 目前手写维护，与各 system 实体（RxDBChange/RxDBBranch/RxDBSync/RxDBMigration）保持同步。
 * 后续可考虑接入 rxdb-client-generator 自动生成，但当前文件量小、变更频率低，
 * 手写比维护 codegen 工具链更划算。
 */

import { RxDBEntityId, UUID } from '../entity/entity.interface.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import {
  BooleanRules,
  DateRules,
  NumberRules,
  RuleGroupBase,
  StringRules,
  UUIDRules
} from '../repository/query.interface.js';
import {
  RelationBooleanRules,
  RelationDateRules,
  RelationExistsRules,
  RelationNumberRules,
  RelationStringRules,
  RelationUUIDRules
} from '../repository/relation-query.interface.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { RxDBBranch } from './branch.js';
import { RxDBChange } from './change.js';
import { RxDBMigration } from './migration.js';
import { RxDBSync } from './sync.js';

/**
 * 规则
 */
declare type RxDBSyncRule =
  | StringRules<RxDBSync, 'id'>
  | StringRules<RxDBSync, 'namespace'>
  | StringRules<RxDBSync, 'entity'>
  | StringRules<RxDBSync, 'syncType'>
  | NumberRules<RxDBSync, 'lastPushedChangeId'>
  | DateRules<RxDBSync, 'lastPushedAt'>
  | DateRules<RxDBSync, 'lastPulledAt'>
  | NumberRules<RxDBSync, 'lastPullRemoteChangeId'>
  | BooleanRules<RxDBSync, 'enabled'>
  | DateRules<RxDBSync, 'createdAt'>
  | DateRules<RxDBSync, 'updatedAt'>
  | StringRules<RxDBSync, 'branchId'>
  | RelationExistsRules<'branch', RxDBBranchRuleGroup>
  | RelationStringRules<'branch.id', string>
  | RelationBooleanRules<'branch.activated', boolean>
  | RelationNumberRules<'branch.fromChangeId', number | null>
  | RelationBooleanRules<'branch.local', boolean>
  | RelationBooleanRules<'branch.remote', boolean>
  | RelationDateRules<'branch.createdAt', Date | null>
  | RelationDateRules<'branch.updatedAt', Date | null>
  | StringRules<RxDBBranch, 'parentId'>
  | RelationNumberRules<'branch.changes.id', number>
  | RelationNumberRules<'branch.changes.remoteId', number | null>
  | RelationNumberRules<'branch.changes.localId', number | null>
  | RelationStringRules<'branch.changes.type', string>
  | RelationUUIDRules<'branch.changes.transactionId', UUID | null>
  | RelationStringRules<'branch.changes.namespace', string>
  | RelationStringRules<'branch.changes.entity', string>
  | RelationUUIDRules<'branch.changes.entityId', RxDBEntityId>
  | RelationDateRules<'branch.changes.createdAt', Date>
  | RelationDateRules<'branch.changes.updatedAt', Date>
  | RelationDateRules<'branch.changes.revertChangedAt', Date | null>
  | RelationNumberRules<'branch.changes.revertChangeId', number | null>
  | RelationDateRules<'branch.changes.redoInvalidatedAt', Date | null>
  | StringRules<RxDBChange, 'branchId'>
  | RelationStringRules<'branch.children.id', string>
  | RelationBooleanRules<'branch.children.activated', boolean>
  | RelationNumberRules<'branch.children.fromChangeId', number | null>
  | RelationBooleanRules<'branch.children.local', boolean>
  | RelationBooleanRules<'branch.children.remote', boolean>
  | RelationDateRules<'branch.children.createdAt', Date | null>
  | RelationDateRules<'branch.children.updatedAt', Date | null>
  | RelationStringRules<'branch.parent.id', string>
  | RelationBooleanRules<'branch.parent.activated', boolean>
  | RelationNumberRules<'branch.parent.fromChangeId', number | null>
  | RelationBooleanRules<'branch.parent.local', boolean>
  | RelationBooleanRules<'branch.parent.remote', boolean>
  | RelationDateRules<'branch.parent.createdAt', Date | null>
  | RelationDateRules<'branch.parent.updatedAt', Date | null>;

/**
 * 规则组基类
 */
export declare type RxDBSyncRuleGroup = RuleGroupBase<
  typeof RxDBSync,
  | 'id'
  | 'namespace'
  | 'entity'
  | 'syncType'
  | 'lastPushedChangeId'
  | 'lastPushedAt'
  | 'lastPulledAt'
  | 'lastPullRemoteChangeId'
  | 'enabled'
  | 'createdAt'
  | 'updatedAt'
  | 'branchId'
  | 'branch'
  | 'branch.id'
  | 'branch.activated'
  | 'branch.fromChangeId'
  | 'branch.local'
  | 'branch.remote'
  | 'branch.createdAt'
  | 'branch.updatedAt'
  | 'parentId'
  | 'branch.changes.id'
  | 'branch.changes.remoteId'
  | 'branch.changes.localId'
  | 'branch.changes.type'
  | 'branch.changes.transactionId'
  | 'branch.changes.namespace'
  | 'branch.changes.entity'
  | 'branch.changes.entityId'
  | 'branch.changes.createdAt'
  | 'branch.changes.updatedAt'
  | 'branch.changes.revertChangedAt'
  | 'branch.changes.revertChangeId'
  | 'branch.changes.redoInvalidatedAt'
  | 'branchId'
  | 'branch.children.id'
  | 'branch.children.activated'
  | 'branch.children.fromChangeId'
  | 'branch.children.local'
  | 'branch.children.remote'
  | 'branch.children.createdAt'
  | 'branch.children.updatedAt'
  | 'parentId'
  | 'branch.parent.id'
  | 'branch.parent.activated'
  | 'branch.parent.fromChangeId'
  | 'branch.parent.local'
  | 'branch.parent.remote'
  | 'branch.parent.createdAt'
  | 'branch.parent.updatedAt'
  | 'parentId',
  RxDBSyncRule
>;

/**
 * 排序字段
 */
export declare type RxDBSyncOrderByField =
  | 'id'
  | 'namespace'
  | 'entity'
  | 'syncType'
  | 'lastPushedChangeId'
  | 'lastPushedAt'
  | 'lastPulledAt'
  | 'lastPullRemoteChangeId'
  | 'enabled'
  | 'createdAt'
  | 'updatedAt';

/**
 * 规则
 */
declare type RxDBMigrationRule =
  NumberRules<RxDBMigration, 'id'> | StringRules<RxDBMigration, 'name'> | DateRules<RxDBMigration, 'executedAt'>;

/**
 * 规则组基类
 */
export declare type RxDBMigrationRuleGroup = RuleGroupBase<
  typeof RxDBMigration,
  'id' | 'name' | 'executedAt',
  RxDBMigrationRule
>;

/**
 * 排序字段
 */
export declare type RxDBMigrationOrderByField = 'id' | 'name' | 'executedAt';

/**
 * 规则
 */
declare type RxDBChangeRule =
  | NumberRules<RxDBChange, 'id'>
  | NumberRules<RxDBChange, 'remoteId'>
  | NumberRules<RxDBChange, 'localId'>
  | StringRules<RxDBChange, 'type'>
  | UUIDRules<RxDBChange, 'transactionId'>
  | StringRules<RxDBChange, 'namespace'>
  | StringRules<RxDBChange, 'entity'>
  | UUIDRules<RxDBChange, 'entityId', RxDBEntityId>
  | DateRules<RxDBChange, 'createdAt'>
  | DateRules<RxDBChange, 'updatedAt'>
  | DateRules<RxDBChange, 'revertChangedAt'>
  | NumberRules<RxDBChange, 'revertChangeId'>
  | DateRules<RxDBChange, 'redoInvalidatedAt'>
  | StringRules<RxDBChange, 'branchId'>
  | RelationExistsRules<'branch', RxDBBranchRuleGroup>
  | RelationStringRules<'branch.id', string>
  | RelationBooleanRules<'branch.activated', boolean>
  | RelationNumberRules<'branch.fromChangeId', number | null>
  | RelationBooleanRules<'branch.local', boolean>
  | RelationBooleanRules<'branch.remote', boolean>
  | RelationDateRules<'branch.createdAt', Date | null>
  | RelationDateRules<'branch.updatedAt', Date | null>
  | StringRules<RxDBBranch, 'parentId'>
  | RelationStringRules<'branch.syncs.id', string>
  | RelationStringRules<'branch.syncs.namespace', string>
  | RelationStringRules<'branch.syncs.entity', string>
  | RelationStringRules<'branch.syncs.syncType', string>
  | RelationNumberRules<'branch.syncs.lastPushedChangeId', number | null>
  | RelationDateRules<'branch.syncs.lastPushedAt', Date | null>
  | RelationDateRules<'branch.syncs.lastPulledAt', Date | null>
  | RelationNumberRules<'branch.syncs.lastPullRemoteChangeId', number | null>
  | RelationBooleanRules<'branch.syncs.enabled', boolean>
  | RelationDateRules<'branch.syncs.createdAt', Date | null>
  | RelationDateRules<'branch.syncs.updatedAt', Date | null>
  | StringRules<RxDBSync, 'branchId'>
  | RelationStringRules<'branch.children.id', string>
  | RelationBooleanRules<'branch.children.activated', boolean>
  | RelationNumberRules<'branch.children.fromChangeId', number | null>
  | RelationBooleanRules<'branch.children.local', boolean>
  | RelationBooleanRules<'branch.children.remote', boolean>
  | RelationDateRules<'branch.children.createdAt', Date | null>
  | RelationDateRules<'branch.children.updatedAt', Date | null>
  | RelationStringRules<'branch.parent.id', string>
  | RelationBooleanRules<'branch.parent.activated', boolean>
  | RelationNumberRules<'branch.parent.fromChangeId', number | null>
  | RelationBooleanRules<'branch.parent.local', boolean>
  | RelationBooleanRules<'branch.parent.remote', boolean>
  | RelationDateRules<'branch.parent.createdAt', Date | null>
  | RelationDateRules<'branch.parent.updatedAt', Date | null>;

/**
 * 规则组基类
 */
export declare type RxDBChangeRuleGroup = RuleGroupBase<
  typeof RxDBChange,
  | 'id'
  | 'remoteId'
  | 'localId'
  | 'type'
  | 'transactionId'
  | 'namespace'
  | 'entity'
  | 'entityId'
  | 'createdAt'
  | 'updatedAt'
  | 'revertChangedAt'
  | 'revertChangeId'
  | 'redoInvalidatedAt'
  | 'branchId'
  | 'branch'
  | 'branch.id'
  | 'branch.activated'
  | 'branch.fromChangeId'
  | 'branch.local'
  | 'branch.remote'
  | 'branch.createdAt'
  | 'branch.updatedAt'
  | 'parentId'
  | 'branch.syncs.id'
  | 'branch.syncs.namespace'
  | 'branch.syncs.entity'
  | 'branch.syncs.syncType'
  | 'branch.syncs.lastPushedChangeId'
  | 'branch.syncs.lastPushedAt'
  | 'branch.syncs.lastPulledAt'
  | 'branch.syncs.lastPullRemoteChangeId'
  | 'branch.syncs.enabled'
  | 'branch.syncs.createdAt'
  | 'branch.syncs.updatedAt'
  | 'branchId'
  | 'branch.children.id'
  | 'branch.children.activated'
  | 'branch.children.fromChangeId'
  | 'branch.children.local'
  | 'branch.children.remote'
  | 'branch.children.createdAt'
  | 'branch.children.updatedAt'
  | 'parentId'
  | 'branch.parent.id'
  | 'branch.parent.activated'
  | 'branch.parent.fromChangeId'
  | 'branch.parent.local'
  | 'branch.parent.remote'
  | 'branch.parent.createdAt'
  | 'branch.parent.updatedAt'
  | 'parentId',
  RxDBChangeRule
>;

/**
 * 排序字段
 */
export declare type RxDBChangeOrderByField =
  | 'id'
  | 'remoteId'
  | 'localId'
  | 'type'
  | 'transactionId'
  | 'namespace'
  | 'entity'
  | 'entityId'
  | 'inversePatch'
  | 'patch'
  | 'createdAt'
  | 'updatedAt'
  | 'revertChangedAt'
  | 'revertChangeId'
  | 'redoInvalidatedAt';

/**
 * 规则
 */
declare type RxDBBranchRule =
  | StringRules<RxDBBranch, 'id'>
  | BooleanRules<RxDBBranch, 'activated'>
  | NumberRules<RxDBBranch, 'fromChangeId'>
  | BooleanRules<RxDBBranch, 'local'>
  | BooleanRules<RxDBBranch, 'remote'>
  | DateRules<RxDBBranch, 'createdAt'>
  | DateRules<RxDBBranch, 'updatedAt'>
  | StringRules<RxDBBranch, 'parentId'>
  | RelationExistsRules<'changes', RxDBChangeRuleGroup>
  | RelationNumberRules<'changes.id', number>
  | RelationNumberRules<'changes.remoteId', number | null>
  | RelationNumberRules<'changes.localId', number | null>
  | RelationStringRules<'changes.type', string>
  | RelationUUIDRules<'changes.transactionId', UUID | null>
  | RelationStringRules<'changes.namespace', string>
  | RelationStringRules<'changes.entity', string>
  | RelationUUIDRules<'changes.entityId', RxDBEntityId>
  | RelationDateRules<'changes.createdAt', Date>
  | RelationDateRules<'changes.updatedAt', Date>
  | RelationDateRules<'changes.revertChangedAt', Date | null>
  | RelationNumberRules<'changes.revertChangeId', number | null>
  | RelationDateRules<'changes.redoInvalidatedAt', Date | null>
  | StringRules<RxDBChange, 'branchId'>
  | RelationExistsRules<'syncs', RxDBSyncRuleGroup>
  | RelationStringRules<'syncs.id', string>
  | RelationStringRules<'syncs.namespace', string>
  | RelationStringRules<'syncs.entity', string>
  | RelationStringRules<'syncs.syncType', string>
  | RelationNumberRules<'syncs.lastPushedChangeId', number | null>
  | RelationDateRules<'syncs.lastPushedAt', Date | null>
  | RelationDateRules<'syncs.lastPulledAt', Date | null>
  | RelationNumberRules<'syncs.lastPullRemoteChangeId', number | null>
  | RelationBooleanRules<'syncs.enabled', boolean>
  | RelationDateRules<'syncs.createdAt', Date | null>
  | RelationDateRules<'syncs.updatedAt', Date | null>
  | StringRules<RxDBSync, 'branchId'>
  | RelationExistsRules<'children', RxDBBranchRuleGroup>
  | RelationStringRules<'children.id', string>
  | RelationBooleanRules<'children.activated', boolean>
  | RelationNumberRules<'children.fromChangeId', number | null>
  | RelationBooleanRules<'children.local', boolean>
  | RelationBooleanRules<'children.remote', boolean>
  | RelationDateRules<'children.createdAt', Date | null>
  | RelationDateRules<'children.updatedAt', Date | null>
  | RelationExistsRules<'parent', RxDBBranchRuleGroup>
  | RelationStringRules<'parent.id', string>
  | RelationBooleanRules<'parent.activated', boolean>
  | RelationNumberRules<'parent.fromChangeId', number | null>
  | RelationBooleanRules<'parent.local', boolean>
  | RelationBooleanRules<'parent.remote', boolean>
  | RelationDateRules<'parent.createdAt', Date | null>
  | RelationDateRules<'parent.updatedAt', Date | null>;

/**
 * 规则组基类
 */
export declare type RxDBBranchRuleGroup = RuleGroupBase<
  typeof RxDBBranch,
  | 'id'
  | 'activated'
  | 'fromChangeId'
  | 'local'
  | 'remote'
  | 'createdAt'
  | 'updatedAt'
  | 'parentId'
  | 'changes'
  | 'changes.id'
  | 'changes.remoteId'
  | 'changes.localId'
  | 'changes.type'
  | 'changes.transactionId'
  | 'changes.namespace'
  | 'changes.entity'
  | 'changes.entityId'
  | 'changes.createdAt'
  | 'changes.updatedAt'
  | 'changes.revertChangedAt'
  | 'changes.revertChangeId'
  | 'changes.redoInvalidatedAt'
  | 'branchId'
  | 'syncs'
  | 'syncs.id'
  | 'syncs.namespace'
  | 'syncs.entity'
  | 'syncs.syncType'
  | 'syncs.lastPushedChangeId'
  | 'syncs.lastPushedAt'
  | 'syncs.lastPulledAt'
  | 'syncs.lastPullRemoteChangeId'
  | 'syncs.enabled'
  | 'syncs.createdAt'
  | 'syncs.updatedAt'
  | 'branchId'
  | 'children'
  | 'children.id'
  | 'children.activated'
  | 'children.fromChangeId'
  | 'children.local'
  | 'children.remote'
  | 'children.createdAt'
  | 'children.updatedAt'
  | 'parentId'
  | 'parent'
  | 'parent.id'
  | 'parent.activated'
  | 'parent.fromChangeId'
  | 'parent.local'
  | 'parent.remote'
  | 'parent.createdAt'
  | 'parent.updatedAt'
  | 'parentId',
  RxDBBranchRule
>;

/**
 * 排序字段
 */
export declare type RxDBBranchOrderByField =
  'id' | 'activated' | 'fromChangeId' | 'local' | 'remote' | 'createdAt' | 'updatedAt';

/**
 * 树形规则
 */
declare type RxDBBranchTreeRule =
  | RelationBooleanRules<'children.activated', boolean>
  | RelationNumberRules<'children.fromChangeId', number | null>
  | RelationBooleanRules<'children.local', boolean>
  | RelationBooleanRules<'children.remote', boolean>
  | RelationDateRules<'children.createdAt', Date | null>
  | RelationDateRules<'children.updatedAt', Date | null>;

/**
 * 树形规则组
 */
export declare type RxDBBranchTreeRuleGroup = RuleGroupBase<
  typeof RxDBBranch,
  | 'children.activated'
  | 'children.fromChangeId'
  | 'children.local'
  | 'children.remote'
  | 'children.createdAt'
  | 'children.updatedAt',
  RxDBBranchTreeRule
>;

/**
 * rxdb
 */
declare module '@aiao/rxdb' {
  /**
   * RxDB
   */
  interface RxDB {
    /**
     * RxDBSync
     */
    RxDBSync: typeof RxDBSync;
    /**
     * RxDBMigration
     */
    RxDBMigration: typeof RxDBMigration;
    /**
     * RxDBChange
     */
    RxDBChange: typeof RxDBChange;
    /**
     * RxDBBranch
     */
    RxDBBranch: typeof RxDBBranch;
  }
}

/**
 * 静态类型
 */
export interface RxDBSyncStaticTypes {
  /**
   * id 类型
   */
  idType: string;
  /**
   * 查询选项
   */
  getOptions: string;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof RxDBSync, RxDBSyncRuleGroup>;
}

/**
 * 初始化数据
 */
export interface RxDBSyncInitData {
  /**
   * id
   */
  id?: string;
  /**
   * 命名空间
   */
  namespace?: string;
  /**
   * 实体
   */
  entity?: string;
  /**
   * 同步类型
   * @default 'none'
   */
  syncType?: 'full' | 'filter' | 'querycache' | 'remote' | 'local' | 'none';
  /**
   * 最后推送的变更 ID
   */
  lastPushedChangeId?: number | null;
  /**
   * 最后推送时间
   */
  lastPushedAt?: Date | null;
  /**
   * 最后拉取时间
   */
  lastPulledAt?: Date | null;
  /**
   * 最后拉取的远程变更 ID
   */
  lastPullRemoteChangeId?: number | null;
  /**
   * 是否启用
   */
  enabled?: boolean;
  /**
   * 创建时间
   * @default new Date()
   */
  createdAt?: Date | null;
  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt?: Date | null;
}

/**
 * 静态类型
 */
export interface RxDBMigrationStaticTypes {
  /**
   * id 类型
   */
  idType: number;
  /**
   * 查询选项
   */
  getOptions: number;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof RxDBMigration, RxDBMigrationRuleGroup, RxDBMigrationOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof RxDBMigration, RxDBMigrationRuleGroup>;
}

/**
 * 初始化数据
 */
export interface RxDBMigrationInitData {
  /**
   * id
   */
  id?: number;
  /**
   * 名称
   */
  name?: string;
  /**
   * 执行时间
   * @default new Date()
   */
  executedAt?: Date;
}

/**
 * 静态类型
 */
export interface RxDBChangeStaticTypes {
  /**
   * id 类型
   */
  idType: number;
  /**
   * 查询选项
   */
  getOptions: number;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>;
}

/**
 * 初始化数据
 */
export interface RxDBChangeInitData {
  /**
   * id
   */
  id?: number;
  /**
   * 远程 ID
   */
  remoteId?: number | null;
  /**
   * 类型
   */
  type?: string;
  /**
   * 事务 ID
   */
  transactionId?: UUID | null;
  /**
   * 命名空间
   */
  namespace?: string;
  /**
   * 实体
   */
  entity?: string;
  /**
   * 实体 ID
   */
  entityId?: RxDBEntityId;
  /**
   * 逆向补丁
   */
  inversePatch?: Record<string, unknown> | null;
  /**
   * 补丁
   */
  patch?: Record<string, unknown> | null;
  /**
   * 创建时间
   * @default new Date()
   */
  createdAt?: Date;
  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt?: Date;
  /**
   * 撤销时间
   */
  revertChangedAt?: Date | null;
  /**
   * 撤销变更 ID
   */
  revertChangeId?: number | null;
  /**
   * Redo 失效时间
   */
  redoInvalidatedAt?: Date | null;
}

/**
 * 静态类型
 */
export interface RxDBBranchStaticTypes {
  /**
   * id 类型
   */
  idType: string;
  /**
   * 查询选项
   */
  getOptions: string;
  /**
   * 查询选项
   */
  findOneOrFailOptions: FindOneOrFailOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>;
  /**
   * 查询选项
   */
  findOptions: FindOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>;
  /**
   * 查询选项
   */
  findOneOptions: FindOneOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>;
  /**
   * 查询选项
   */
  findAllOptions: FindAllOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>;
  /**
   * 查询选项
   */
  findByCursorOptions: FindByCursorOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>;
  /**
   * 查询选项
   */
  countOptions: CountOptions<typeof RxDBBranch, RxDBBranchRuleGroup>;
  /**
   * 查询的实体
   */
  entity: RxDBBranch;
  /**
   * 查询选项
   */
  findDescendantsOptions: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>;
  /**
   * 查询选项
   */
  countDescendantsOptions: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>;
  /**
   * 查询选项
   */
  findAncestorsOptions: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>;
  /**
   * 查询选项
   */
  countAncestorsOptions: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>;
}

/**
 * 初始化数据
 */
export interface RxDBBranchInitData {
  /**
   * id
   */
  id?: string;
  /**
   * 是否激活
   */
  activated?: boolean;
  /**
   * 来源变更 ID
   */
  fromChangeId?: number | null;
  /**
   * 是否本地
   */
  local?: boolean;
  /**
   * 是否远程
   */
  remote?: boolean;
  /**
   * 创建时间
   * @default new Date()
   */
  createdAt?: Date | null;
  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt?: Date | null;
}
