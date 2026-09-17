/**
 * @fileoverview `CommitBranchRef` 实体定义（data-model.md §2.5）
 *
 * 分支 HEAD 指针与 CAS 代际。一分支一行。
 */

import { Entity, OnDeleteAction, PropertyType, RelationKind, RxDBBranch } from '@aiao/rxdb';

/**
 * 分支 ref 的健康状态
 *
 * @remarks
 * `corrupted_read_only` 由**单一守卫**（data-model.md §6）写入；`commit()` / `restore()` /
 * switch-to 三入口各自在自己的写事务内调用同一份守卫，拒绝码同为 `commit_graph_corrupted`。
 */
export type CommitBranchRefStatus = 'ok' | 'corrupted_read_only';

/**
 * 分支 HEAD 与 CAS 代际
 *
 * @remarks
 * - **推进 HEAD 的 CAS**：`UPDATE … WHERE id = ? AND generation = ? AND headRevision = ?`，
 *   命中 0 行即 `CommitConflict`。
 * - {@link CommitBranchRef.generation} **不可变且不复用**，专治 ABA。
 */
@Entity({
  namespace: 'rxdb',
  name: 'CommitBranchRef',
  tableName: 'rxdb_commit_branch_ref',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'generation',
      type: PropertyType.integer,
      readonly: true
    },
    {
      name: 'headCommitId',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'headRevision',
      type: PropertyType.integer,
      default: 0
    },
    {
      name: 'status',
      type: PropertyType.string,
      default: 'ok'
    },
    {
      name: 'corruptedAt',
      type: PropertyType.date,
      nullable: true
    }
  ],
  relations: [
    {
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'commitBranchRef',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class CommitBranchRef {
  /**
   * 主键 = branchId（一分支一行）
   */
  id!: string;

  /**
   * 所属分支 id（外键列）
   *
   * @remarks
   * 值恒等于 {@link CommitBranchRef.id}；单独成列只为拿到数据库级外键与 `ON DELETE CASCADE`，
   * 删分支时本行随之消失。写入方只写 {@link CommitBranchRef.id} 的同一个值。
   */
  branchId!: string;

  /**
   * 分支代际，建分支时从 `WorkingTreeActivationState.branchGenerationSeq` 取用
   *
   * @remarks
   * 只读且不复用：删分支后同名重建拿到新代际，持旧 `(branchId, headRevision)` 的调用方不会误中新分支。
   */
  generation!: number;

  /**
   * 当前 HEAD commit；空分支为 `null`
   */
  headCommitId!: string | null;

  /**
   * HEAD 推进 revision，CAS 的比较位
   */
  headRevision!: number;

  /**
   * ref 健康状态
   */
  status!: CommitBranchRefStatus;

  /**
   * 进入 `corrupted_read_only` 的时刻
   */
  corruptedAt!: Date | null;

  /**
   * 关联分支
   *
   * @remarks
   * `declare` 不是语气问题：`useDefineForClassFields` 打开时，普通字段声明会 emit 成
   * `this.branch = undefined`，于是每一行实例都带一个从没被赋值过的 `branch` 自有属性，
   * `Object.keys(row)` 因此永远比真实列多一个。关系由 ORM 按需挂载，不占这个位置。
   */
  declare branch?: RxDBBranch;
}
