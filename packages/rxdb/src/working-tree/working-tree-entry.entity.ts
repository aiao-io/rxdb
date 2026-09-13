/**
 * @fileoverview `WorkingTreeEntry` 实体定义（data-model.md §2.7）
 *
 * 未提交变更单元：**独立完整**复制 patch / inversePatch，不复用也不只引用 `RxDBChange`。
 */

import { Entity } from '../entity/entity.decorator.js';
import { OnDeleteAction, PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { RxDBBranch } from '../system/branch.js';

/**
 * 未提交变更单元（一行 = 一个分支上的一个实体身份）
 *
 * @remarks
 * **折叠规则**——第二次写入同一实体时：
 *
 * 1. {@link WorkingTreeEntry.patch} 取**最新合成值**；{@link WorkingTreeEntry.inversePatch}
 *    **保持首次捕获值**不变（否则 inverse 只能退回上一次中间态，退不回 HEAD）。
 * 2. `insert` 之后 `delete`（该行在 HEAD 不存在）→ **净无变化**：删除条目、`entryCount` 递减、
 *    **不**留 `delete` 单元。
 * 3. {@link WorkingTreeEntry.origin} 取**最新**一次写入的来源；`local` 与 `remote_sync` 折叠进同一
 *    单元时按最新值记，`status()` / `diff()` 照常展示。
 * 4. **不做值级归零**（把 update 改回 HEAD 原值不会自动消解成无单元）。理由：值级归零要读 HEAD 投影，
 *    代价与 `diff()` 同阶，摊到每次 `save()` 上会直接顶穿 SC-001 预算。这是**已知取舍**，不是遗漏。
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeEntry',
  tableName: 'rxdb_working_tree_entry',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'unitId',
      type: PropertyType.string
    },
    {
      name: 'transactionId',
      type: PropertyType.uuid,
      nullable: true
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
      name: 'entityId',
      type: PropertyType.string
    },
    {
      name: 'operation',
      type: PropertyType.string
    },
    {
      name: 'patch',
      type: PropertyType.json,
      nullable: true
    },
    {
      name: 'inversePatch',
      type: PropertyType.json,
      nullable: true
    },
    {
      name: 'fingerprint',
      type: PropertyType.string
    },
    {
      name: 'origin',
      type: PropertyType.string
    },
    {
      name: 'sourceChangeId',
      type: PropertyType.integer,
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
  indexes: [
    {
      name: 'idx_working_tree_entry_unit',
      properties: ['branchId', 'unitId']
    },
    {
      name: 'idx_working_tree_entry_identity',
      properties: ['branchId', 'namespace', 'entity', 'entityId'],
      unique: true
    }
  ],
  relations: [
    {
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'workingTreeEntries',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class WorkingTreeEntry {
  /**
   * 主键
   */
  id!: string;

  /**
   * 所属分支 id（外键列）——分支级隔离
   */
  branchId!: string;

  /**
   * 变更单元 id
   *
   * @remarks
   * **完整事务共享同一 unit**，提交时整体进入同一个 `CommitChangeSet` 序列。
   */
  unitId!: string;

  /**
   * 事务 id
   */
  transactionId!: string | null;

  /**
   * 实体命名空间
   */
  namespace!: string;

  /**
   * 实体名称
   */
  entity!: string;

  /**
   * 实体 id
   */
  entityId!: string;

  /**
   * 操作类型
   */
  operation!: 'insert' | 'update' | 'delete';

  /**
   * 正向补丁——**独立完整副本**，取最新合成值
   */
  patch!: Record<string, unknown> | null;

  /**
   * 逆向补丁——**独立完整副本**，取首次捕获值
   */
  inversePatch!: Record<string, unknown> | null;

  /**
   * 当前指纹
   */
  fingerprint!: string;

  /**
   * 变更来源
   */
  origin!: 'local' | 'remote_sync';

  /**
   * 来源 change id——**仅诊断**
   *
   * @remarks
   * 无外键约束，**不得作为重放数据来源**：`rxdb_change` 会被删分支级联 / 压缩合并 /
   * 回滚标记 / 失效标记清理，重放数据只能来自本行自己的 patch / inversePatch。
   */
  sourceChangeId!: number | null;

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
