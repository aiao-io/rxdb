/**
 * @fileoverview `Commit` 实体定义（data-model.md §2.3）
 *
 * 不可变提交节点。只追加，永不 UPDATE / DELETE。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

/**
 * 提交节点的种类
 *
 * @remarks
 * `normal` 之外的两种是**系统根节点**：`baseline` 由一次性启用迁移为每个本地可完整物化分支生成
 * （FR-021/049），`branch_baseline` 由 `createBranch(branchId, fromChangeId)` 与 metadata-only
 * 远端分支的首次物化生成（FR-017/044）。两者是 FR-008/009 的**唯一例外**——只有它们允许
 * 无用户作者、无用户消息且 ChangeSet 为空。
 *
 * 种类必须是独立一列，不能从「`author` 为空」反推：那把两种根节点压成同一种，
 * 而 FR-044 的物化屏障要求能单独认出 `branch_baseline`；更要命的是它让「作者恰好没记上的
 * 普通 commit」与系统根节点不可区分，于是空 ChangeSet 的门禁对前者也失效。
 */
export type CommitKind = 'normal' | 'baseline' | 'branch_baseline';

/**
 * 不可变提交节点
 *
 * @remarks
 * - **只追加**，永不 UPDATE / DELETE。
 * - 幂等靠 {@link Commit.operationId} 的唯一索引 + 既有 `isUniqueConstraintViolation()` 判别：
 *   撞约束 = 同一次提交重放，读回现有节点返回，**不新建**。该谓词必须**贴在这一条 INSERT 上**，
 *   不得在事务外层泛用。
 * - 祖先可达性沿 {@link Commit.parentIds} 向上走，方向与 FR-022 的损坏判定一致，因此**不建 edge 表**。
 */
@Entity({
  namespace: 'rxdb',
  name: 'Commit',
  tableName: 'rxdb_commit',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'parentIds',
      type: PropertyType.json
    },
    {
      name: 'firstParentId',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'kind',
      type: PropertyType.string,
      readonly: true
    },
    {
      name: 'message',
      type: PropertyType.string
    },
    {
      name: 'author',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP',
      readonly: true
    },
    {
      name: 'operationId',
      type: PropertyType.uuid,
      unique: true
    },
    {
      name: 'changeSetCount',
      type: PropertyType.integer
    },
    {
      name: 'contentFingerprint',
      type: PropertyType.string
    }
  ],
  indexes: [
    {
      name: 'idx_commit_first_parent',
      properties: ['firstParentId']
    }
  ]
})
export class Commit {
  /**
   * commit id
   */
  id!: string;

  /**
   * 父链数组
   *
   * @remarks
   * 根 commit 为 `[]`，merge 可多父。
   */
  parentIds!: string[];

  /**
   * 首父冗余列，供祖先遍历走索引
   *
   * @remarks
   * 冗余列就是第二份真相的温床，因此配一条不变量断言
   * （`firstParentId === parentIds[0] ?? null`）进 conformance 套件。
   */
  firstParentId!: string | null;

  /**
   * 提交种类
   *
   * @remarks
   * **无默认值**是有意的：默认成 `normal` 会让漏赋值的系统根节点静默变成普通 commit，
   * 而那正好绕开 FR-009 的空 ChangeSet 门禁。每个写入方必须自己说出种类。
   */
  kind!: CommitKind;

  /**
   * 提交信息
   *
   * @remarks
   * 普通 commit 要求 trim 后非空且由调用方提供；两种系统根节点写系统生成的固定文案
   * （列本身 not null，没有「无消息」这种物理状态）。
   */
  message!: string;

  /**
   * 提交者；未记录时为 `null`
   */
  author!: string | null;

  /**
   * 创建时间
   */
  createdAt!: Date;

  /**
   * 幂等键（唯一）
   *
   * @remarks
   * 同一次 `commit()` 的重放带同一个 `operationId`，撞唯一约束即读回现有节点。
   */
  operationId!: string;

  /**
   * 本 commit 的变更单元数
   *
   * @remarks
   * 与 `rxdb_commit_change_set` 实际行数比对，图校验用。
   */
  changeSetCount!: number;

  /**
   * FR-022 图校验的节点指纹
   */
  contentFingerprint!: string;
}
