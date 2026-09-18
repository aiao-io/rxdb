/**
 * @fileoverview `WorkingTreeMaterializationPage` 实体定义（data-model.md §2.9）
 *
 * 物化 staging 的分页 payload 子表。
 */

import { Entity, OnDeleteAction, PropertyType, RelationKind } from '@aiao/rxdb';
import { WorkingTreeMaterializationStage } from './working-tree-materialization-stage.entity.js';

/**
 * 物化 staging 的分页 payload
 *
 * @remarks
 * 随 {@link WorkingTreeMaterializationStage} 级联删除：attempt 被丢弃时分页不得残留，
 * 否则下一次续用判定会读到不属于任何 attempt 的半份 payload。
 */
@Entity({
  namespace: 'rxdb',
  name: 'WorkingTreeMaterializationPage',
  tableName: 'rxdb_working_tree_materialization_page',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'pageIndex',
      type: PropertyType.integer
    },
    {
      name: 'payload',
      type: PropertyType.json
    },
    {
      name: 'fingerprint',
      type: PropertyType.string
    }
  ],
  indexes: [
    {
      name: 'idx_working_tree_materialization_page_index',
      properties: ['stageId', 'pageIndex'],
      unique: true
    }
  ],
  relations: [
    {
      name: 'stage',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'WorkingTreeMaterializationStage',
      mappedProperty: 'pages',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class WorkingTreeMaterializationPage {
  /**
   * 主键
   */
  id!: string;

  /**
   * 所属 attempt id（外键列）
   */
  stageId!: string;

  /**
   * 分页序号，唯一于 `(stage, pageIndex)`
   */
  pageIndex!: number;

  /**
   * 该页的快照 payload
   */
  payload!: Record<string, unknown>;

  /**
   * 该页指纹
   */
  fingerprint!: string;

  /**
   * 关联 attempt
   *
   * @remarks
   * `declare` 不是语气问题：`useDefineForClassFields` 打开时，普通字段声明会 emit 成
   * `this.stage = undefined`，于是每一行实例都带一个从没被赋值过的 `stage` 自有属性，
   * `Object.keys(row)` 因此永远比真实列多一个。关系由 ORM 按需挂载，不占这个位置。
   * 同包另外四个实体的关联字段（如 `working-tree-entry.entity.ts` 的 `branch`）都是这个写法。
   */
  declare stage?: WorkingTreeMaterializationStage;
}
