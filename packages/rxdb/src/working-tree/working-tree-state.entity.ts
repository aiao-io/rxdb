/**
 * @fileoverview `WorkingTreeState` 实体定义（data-model.md §2.6）
 *
 * 分支工作树游标：基线 HEAD、工作树 revision 与条目冗余计数。一分支一行。
 */

import { Entity } from '../entity/entity.decorator.js';
import { OnDeleteAction, PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { RxDBBranch } from '../system/branch.js';

/**
 * 分支工作树游标
 *
 * @remarks
 * {@link WorkingTreeState.entryCount} 是冗余列，存在理由是 `status()` 的「有没有未提交变更」
 * 要走常数时间而不是 `COUNT(*)`（SC-001 的 100 ms 绝对上限）。它与 `rxdb_working_tree_entry`
 * 的实际行数**必须在同一事务内一起改**；conformance 套件要有一条「计数与行数一致」的不变量断言，
 * 否则冗余列就是第二份真相。
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeState',
  tableName: 'rxdb_working_tree_state',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'baseHeadCommitId',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'workingTreeRevision',
      type: PropertyType.integer,
      default: 0
    },
    {
      name: 'entryCount',
      type: PropertyType.integer,
      default: 0
    },
    {
      name: 'updatedAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP'
    }
  ],
  relations: [
    {
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'workingTreeState',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class WorkingTreeState {
  /**
   * 主键 = branchId
   */
  id!: string;

  /**
   * 所属分支 id（外键列）
   *
   * @remarks
   * 值恒等于 {@link WorkingTreeState.id}；单独成列只为拿到数据库级外键与 `ON DELETE CASCADE`。
   */
  branchId!: string;

  /**
   * 工作树所基于的 HEAD；空分支为 `null`
   */
  baseHeadCommitId!: string | null;

  /**
   * 工作树 revision
   *
   * @remarks
   * **事务内读改写型**，不接收调用方期望值。语义 no-op 一律不递增——判定发生在写本行之前，
   * 不是写完再回滚。
   */
  workingTreeRevision!: number;

  /**
   * 未提交条目数（`rxdb_working_tree_entry` 行数的冗余计数）
   */
  entryCount!: number;

  /**
   * 更新时间
   */
  updatedAt!: Date;

  /**
   * 关联分支
   */
  branch?: RxDBBranch;
}
