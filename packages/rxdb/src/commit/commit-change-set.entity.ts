/**
 * @fileoverview `CommitChangeSet` 实体定义（data-model.md §2.4）
 *
 * 提交的**不可变恢复数据**：完整复制 patch / inversePatch，不引用 `rxdb_change`。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { Commit } from './commit.entity.js';

/**
 * 提交的不可变恢复数据（一行 = 一个变更单元）
 *
 * @remarks
 * - 与 {@link Commit} **同一事务**写入；只追加。
 * - **不存 `rxdb_change.id` 外键**：change 行会被「删分支级联 / 压缩合并 / 回滚标记 / 失效标记」
 *   四条既有路径删除或失效，引用等于把 commit 的可恢复性挂在一张会被清理的表上。
 *   这一条由 conformance 套件的静态断言守住（data-model.md §3）。
 */
@Entity({
  namespace: 'rxdb',
  name: 'CommitChangeSet',
  tableName: 'rxdb_commit_change_set',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'sequence',
      type: PropertyType.integer
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
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'entity',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'entityId',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'operation',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'patch',
      type: PropertyType.json,
      readonly: true,
      nullable: true
    },
    {
      name: 'inversePatch',
      type: PropertyType.json,
      readonly: true,
      nullable: true
    },
    {
      name: 'origin',
      type: PropertyType.string,
      readonly: true
    }
  ],
  indexes: [
    {
      name: 'idx_commit_change_set_sequence',
      properties: ['commitId', 'sequence'],
      unique: true
    }
  ],
  relations: [
    {
      name: 'commit',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Commit',
      mappedProperty: 'changeSets'
    }
  ]
})
export class CommitChangeSet {
  /**
   * 主键
   */
  id!: string;

  /**
   * 所属 commit id（外键列）
   */
  commitId!: string;

  /**
   * 冻结的重放顺序，唯一于 `(commit, sequence)`
   */
  sequence!: number;

  /**
   * 变更单元 id，与 `WorkingTreeEntry.unitId` 同源
   */
  unitId!: string;

  /**
   * 事务 id；完整事务共享同一值
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
   * 正向补丁——**完整不可变副本**
   */
  patch!: Record<string, unknown> | null;

  /**
   * 逆向补丁——**完整不可变副本**
   */
  inversePatch!: Record<string, unknown> | null;

  /**
   * 变更来源
   */
  origin!: 'local' | 'remote_sync';

  /**
   * 关联 commit
   */
  commit?: Commit;
}
