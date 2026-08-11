/**
 * @fileoverview 远程仓库类型定义
 * 定义了 RxDB 系统实体在远程适配器中的仓库接口
 *
 * 更改说明：
 * - 删除了 RemoteRxDBMigrationRepository 接口，因为该接口未被使用，属于冗余代码
 * - 清理了相关的 RxDBMigration 导入，以减少不必要的依赖
 */
import type { CountOptions, FindOptions } from '../repository/query-options.interface.js';
import type { FindTreeOptions } from '../repository/tree-repository.interface.js';
import type { IRxDBAdapter, RxDBAdapterRemoteBase } from '../rxdb-adapter.js';
import type { RxDBBranch } from './branch.js';
import type { RxDBChange } from './change.js';
import type {
  RxDBBranchOrderByField,
  RxDBBranchRuleGroup,
  RxDBBranchTreeRuleGroup,
  RxDBChangeOrderByField,
  RxDBChangeRuleGroup
} from './types.js';

/**
 * RxDBBranch 远程仓库接口
 */
export interface RemoteRxDBBranchRepository {
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
 * RxDBChange 远程仓库接口
 */
export interface RemoteRxDBChangeRepository extends RxDBAdapterRemoteBase, IRxDBAdapter {
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
