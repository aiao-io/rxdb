/**
 * @fileoverview `Commit` 实体定义（data-model.md §2.3）
 *
 * 不可变提交节点。只追加，永不 UPDATE / DELETE。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

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
   * 提交信息
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
