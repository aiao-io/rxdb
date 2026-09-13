/**
 * @fileoverview `WorkingTreeMaterializationStage` 实体定义（data-model.md §2.9）
 *
 * 目标分支物化 staging 的 attempt 头行；分页 payload 见
 * [working-tree-materialization-page.entity.ts](./working-tree-materialization-page.entity.ts)。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

/**
 * 物化 attempt 状态
 */
export type WorkingTreeMaterializationStageStatus = 'pending' | 'staged' | 'aborted';

/**
 * 目标分支物化 staging（attempt 头行）
 *
 * @remarks
 * - 只落**目标分支**快照，**不写当前业务投影**、不更新当前分支同步状态。
 * - switch 成功后连同分页整体删除；失败或中断遗留的 attempt 按
 *   {@link WorkingTreeMaterializationStage.fingerprint} +
 *   {@link WorkingTreeMaterializationStage.scopeManifest} 判定可否续用，
 *   判不了就整体丢弃重来——**不允许**把半份 payload 当成完整快照物化。
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeMaterializationStage',
  tableName: 'rxdb_working_tree_materialization_stage',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'targetBranchId',
      type: PropertyType.string
    },
    {
      name: 'frozenRemoteWatermark',
      type: PropertyType.json
    },
    {
      name: 'scopeManifest',
      type: PropertyType.json
    },
    {
      name: 'fingerprint',
      type: PropertyType.string
    },
    {
      name: 'status',
      type: PropertyType.string
    },
    {
      name: 'pageCount',
      type: PropertyType.integer
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP'
    }
  ],
  indexes: [
    {
      name: 'idx_working_tree_materialization_target',
      properties: ['targetBranchId']
    }
  ]
})
export class WorkingTreeMaterializationStage {
  /**
   * 主键 = attempt id
   */
  id!: string;

  /**
   * 被物化的目标分支 id
   *
   * @remarks
   * 不声明成 `RxDBBranch` 关系：attempt 是 switch 过程中的临时物，目标分支被删时这批 attempt
   * 应当整体丢弃重来，而不是靠外键级联把半份快照留成「看起来还能用」的状态。
   */
  targetBranchId!: string;

  /**
   * 冻结的远端水位
   */
  frozenRemoteWatermark!: Record<string, unknown>;

  /**
   * 快照范围清单
   */
  scopeManifest!: Record<string, unknown>;

  /**
   * 快照指纹，续用判定的比较位
   */
  fingerprint!: string;

  /**
   * attempt 状态
   */
  status!: WorkingTreeMaterializationStageStatus;

  /**
   * 分页数；与实际 page 行数比对，判定 payload 是否完整
   */
  pageCount!: number;

  /**
   * 创建时间
   */
  createdAt!: Date;
}
