/**
 * @fileoverview `WorkingTreeRestoreSession` 实体定义（data-model.md §2.8）
 *
 * 恢复会话：`status().conflicted` 的**唯一来源**。建表属 US-306 阶段 B，生命周期属 US-307。
 */

import { Entity } from '../entity/entity.decorator.js';
import { OnDeleteAction, PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { RxDBBranch } from '../system/branch.js';

/**
 * 恢复会话状态
 */
export type WorkingTreeRestoreSessionStatus = 'active' | 'conflicted' | 'committed';

/**
 * 历史恢复会话
 *
 * @remarks
 * - {@link WorkingTreeRestoreSession.activeKey} 的唯一索引实现「一分支至多一个未结束会话」，
 *   且在 PostgreSQL 与全部 SQLite 绑定上语义一致（`NULL` 不参与唯一比较），
 *   **不需要**各后端写方言化的部分索引。
 * - **`status().conflicted` 的唯一来源就是本表**。没有 durable session 就没有 conflicted；
 *   `CommitConflict` 是一次失败命令的类型化诊断值，**不入库**。
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeRestoreSession',
  tableName: 'rxdb_working_tree_restore_session',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'targetCommitId',
      type: PropertyType.string
    },
    {
      name: 'expectedHeadRevision',
      type: PropertyType.integer
    },
    {
      name: 'expectedWorkingTreeRevision',
      type: PropertyType.integer
    },
    {
      name: 'status',
      type: PropertyType.string
    },
    {
      name: 'activeKey',
      type: PropertyType.string,
      unique: true,
      nullable: true
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP'
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
      mappedProperty: 'workingTreeRestoreSessions',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class WorkingTreeRestoreSession {
  /**
   * 主键
   */
  id!: string;

  /**
   * 所属分支 id（外键列）
   */
  branchId!: string;

  /**
   * 恢复来源 commit
   */
  targetCommitId!: string;

  /**
   * 会话创建时捕获的 HEAD revision
   */
  expectedHeadRevision!: number;

  /**
   * 会话创建时捕获的工作树 revision
   */
  expectedWorkingTreeRevision!: number;

  /**
   * 会话状态
   */
  status!: WorkingTreeRestoreSessionStatus;

  /**
   * 活跃键：非终态时 = branchId，`committed` 时置 `null`
   *
   * @remarks
   * 唯一约束 + `NULL` 不参与唯一比较 = 一分支至多一个未结束会话，且已结束的会话可以无限多行。
   */
  activeKey!: string | null;

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
}
