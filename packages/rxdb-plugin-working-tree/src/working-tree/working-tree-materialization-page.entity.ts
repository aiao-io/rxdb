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
   *
   * @remarks
   * **原样落库，不验加密信封**。本模块不认识业务实体（投影由来源方的 `projectPage` 算），
   * 分不出哪一格本该是加密包：来源方若把加密列交成明文，明文就照样存进这一列——它自己不是加密列。
   * 页指纹只挡「传坏了 / 落库之后被改了」，不挡形态不对；失败或中断的 attempt 又刻意不删
   * （诊断用，见 `BranchNotMaterializedError`），于是这份明文会以残留的形态一直留到调用方
   * `discardMaterializationAttempt` 为止。今天的快照来源是同步插件自动登记的那一个，页里装的是
   * 远端变更记录的原样 patch——与 `pull()` 拉到的是同一份内容，风险有限；
   * 信封校验记在 `requirements/roadmap.md`「epic-006 评审顺延的架构项」，门禁边界见
   * `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §7。
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
