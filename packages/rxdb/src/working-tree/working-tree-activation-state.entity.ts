/**
 * @fileoverview `WorkingTreeActivationState` 实体定义（data-model.md §2.2）
 *
 * 激活态 revision 与分支代际单调源。单行表，主键取常量。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

/**
 * `rxdb_working_tree_activation` 的单行主键常量。
 */
export const WORKING_TREE_ACTIVATION_STATE_ID = 'default';

/**
 * 工作树激活态与分支代际源（单行）
 *
 * @remarks
 * - **不复制第二份 active branch ID**：当前分支的唯一真相仍是 `rxdb_branch.activated`，
 *   本表只存 revision，避免两份真相漂移。
 * - `branchGenerationSeq` 放在本表而不是 `CommitCapabilityState`：create / remove branch
 *   本来就要校验或递增 `activationRevision`，放同一行让分支生命周期只锁一行；
 *   放进能力协商行会让只读的版本协商行变成全局写热点。
 *
 * @see {@link WORKING_TREE_ACTIVATION_STATE_ID}
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeActivationState',
  tableName: 'rxdb_working_tree_activation',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'activationRevision',
      type: PropertyType.integer,
      default: 0
    },
    {
      name: 'branchGenerationSeq',
      type: PropertyType.integer,
      default: 0
    }
  ]
})
export class WorkingTreeActivationState {
  /**
   * 主键，恒为 {@link WORKING_TREE_ACTIVATION_STATE_ID}
   */
  id!: string;

  /**
   * 激活态 revision：switch branch CAS 成功后 +1
   */
  activationRevision!: number;

  /**
   * 分支代际单调源
   *
   * @remarks
   * create branch 时 **+1 并取用**，因此首个签发的代际是 `1`。代际不可复用——
   * 删分支后同名重建拿到新代际，持旧 `(branchId, headRevision)` 的调用方不会误中新分支（ABA 防护）。
   */
  branchGenerationSeq!: number;
}
