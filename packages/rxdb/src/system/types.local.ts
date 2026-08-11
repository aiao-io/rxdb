/**
 * @fileoverview 本地仓库类型定义
 * 定义了 RxDB 系统实体在本地适配器中的仓库接口
 *
 * 更改说明：
 * - 删除了 LocalRxDBMigrationRepository 接口，因为该接口未被使用，属于冗余代码
 * - 清理了相关的 RxDBMigration 导入，以减少不必要的依赖
 */
import { Observable } from 'rxjs';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import type { FindTreeOptions } from '../repository/tree-repository.interface.js';
import type { IRxDBAdapter, RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import type { RxDBBranch } from './branch.js';
import type { RxDBChange } from './change.js';
import { RxDBSync } from './sync.js';
import type {
  RxDBBranchOrderByField,
  RxDBBranchRuleGroup,
  RxDBBranchTreeRuleGroup,
  RxDBChangeOrderByField,
  RxDBChangeRuleGroup,
  RxDBSyncOrderByField
} from './types.js';
import { RxDBSyncRuleGroup } from './types.js';

/**
 * RxDBBranch 本地仓库接口
 */
export interface LocalRxDBBranchRepository {
  /**
   * find 查询
   * @param options - 查询选项
   * @returns 返回查询结果数组
   */
  find(options: FindOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>): Promise<RxDBBranch[]>;
  /**
   * count 查询
   * @param options - 查询选项
   * @returns 返回查询结果数量
   */
  count(options: CountOptions<typeof RxDBBranch, RxDBBranchRuleGroup>): Promise<number>;

  /**
   * 创建实体
   * @param entity - 要创建的实体
   * @returns 返回创建后的实体
   */
  create(entity: InstanceType<typeof RxDBBranch>): Promise<InstanceType<typeof RxDBBranch>>;

  /**
   * 更新实体
   * @param entity - 要更新的实体
   * @param patch - 更新数据
   * @returns 返回更新后的实体
   */
  update(
    entity: InstanceType<typeof RxDBBranch>,
    patch: Partial<InstanceType<typeof RxDBBranch>>
  ): Promise<InstanceType<typeof RxDBBranch>>;

  /**
   * 删除实体
   * @param entity - 要删除的实体
   * @returns 返回删除的实体
   */
  remove(entity: InstanceType<typeof RxDBBranch>): Promise<InstanceType<typeof RxDBBranch>>;

  /**
   * 查询祖先实体数量
   * @param options - 查询选项
   * @returns 返回祖先实体数量
   */
  countAncestors(options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>): Promise<number>;
  /**
   * 查询子孙实体数量
   * @param options - 查询选项
   * @returns 返回子孙实体数量
   */
  countDescendants(options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>): Promise<number>;

  /**
   * 查询祖先实体
   * @param options - 查询选项
   * @returns 返回祖先实体数组
   */
  findAncestors(options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>): Promise<RxDBBranch[]>;
  /**
   * 查询子孙实体
   * @param options - 查询选项
   * @returns 返回子孙实体数组
   */
  findDescendants(options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>): Promise<RxDBBranch[]>;
}

/**
 * RxDBChange 本地仓库接口
 */
export interface LocalRxDBChangeRepository extends RxDBAdapterLocalBase, IRxDBAdapter {
  /**
   * find 查询
   * @param options - 查询选项
   * @returns 返回查询结果数组
   */
  find(
    options: FindOptions<typeof RxDBChange, RxDBChangeRuleGroup, RxDBChangeOrderByField>
  ): Promise<InstanceType<typeof RxDBChange>[]>;

  /**
   * count 查询
   * @param options - 查询选项
   * @returns 返回查询结果数量
   */
  count(options: CountOptions<typeof RxDBChange, RxDBChangeRuleGroup>): Promise<number>;

  /**
   * 创建实体
   * @param entity - 要创建的实体
   * @returns 返回创建后的实体
   */
  create(entity: InstanceType<typeof RxDBChange>): Promise<InstanceType<typeof RxDBChange>>;

  /**
   * 更新实体
   * @param entity - 要更新的实体
   * @param patch - 更新数据
   * @returns 返回更新后的实体
   */
  update(
    entity: InstanceType<typeof RxDBChange>,
    patch: Partial<InstanceType<typeof RxDBChange>>
  ): Promise<InstanceType<typeof RxDBChange>>;

  /**
   * 删除实体
   * @param entity - 要删除的实体
   * @returns 返回删除的实体
   */
  remove(entity: InstanceType<typeof RxDBChange>): Promise<InstanceType<typeof RxDBChange>>;
}
export declare class RxDBSyncRepository {
  /**
   * 统计实体数量
   * @param options 查询选项
   * @example
   * RxDBSync.count({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static count(options: CountOptions<typeof RxDBSync, RxDBSyncRuleGroup>): Observable<number>;
  /**
   * 查询多个实体
   * @param options 查询选项
   * @example
   * RxDBSync.find({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static find(options: FindOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>): Observable<RxDBSync[]>;
  /**
   * 查询所有实体
   * @param options 查询选项
   * @example
   * RxDBSync.findAll({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static findAll(
    options: FindAllOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ): Observable<RxDBSync[]>;
  /**
   * 游标分页查询
   * @param options 查询选项
   * @example
   * RxDBSync.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static findByCursor(
    options: FindByCursorOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ): Observable<RxDBSync[]>;
  /**
   * 查询单个实体,未找到时返回 undefined
   * @param options 查询选项
   * @example
   * RxDBSync.findOne({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static findOne(
    options: FindOneOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ): Observable<RxDBSync | undefined>;
  /**
   * 查询单个实体,未找到时抛出错误
   * @param options 查询选项
   * @example
   * RxDBSync.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe();
   */
  static findOneOrFail(
    options: FindOneOrFailOptions<typeof RxDBSync, RxDBSyncRuleGroup, RxDBSyncOrderByField>
  ): Observable<RxDBSync>;
  /**
   * 根据 ID 获取单个实体
   * @param options 查询选项
   * @example
   * RxDBSync.get('123').subscribe();
   */
  static get(options: string): Observable<RxDBSync>;
}
