/**
 * @fileoverview `Commit` 实体定义（data-model.md §2.3）
 *
 * 不可变提交节点。只追加，永不 UPDATE / DELETE。
 */

import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

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
 *
 * `merge` 是 US-319 加的第四种：**只由导入远端提交写下**（`importCommits()`），本地 `commit()` 从不产出它——
 * 本地没有合并命令，写路径的父链只取当前 HEAD 一个。它有两个及以上的父，**ChangeSet 是合并结果相对第一父的增量**
 * （与 `git diff M^1 M` 同义），所以「某个提交的数据 = 第一父的数据 + 它自己的 ChangeSet」对四种提交一律成立：
 * 导入时把合并提交的 ChangeSet 叠到此刻等于第一父的业务表上，`restore()` 沿第一父链撤销，都靠这一条。
 * 非第一父那一侧的提交只作为历史节点入库，它们的 ChangeSet 从来没有直接落到本分支的业务表上。
 * 合并提交允许空 ChangeSet（只记下祖先关系的合并），这是它与 `normal` 在 FR-009 上的唯一区别。
 */
export type CommitKind = 'normal' | 'merge' | 'baseline' | 'branch_baseline';

/**
 * 两种系统根节点
 *
 * @remarks
 * 单独成名而不是到处写 `Exclude<CommitKind, 'normal'>`：`merge` 进来之后那个写法悄悄多了一种，
 * 「系统根节点的固定文案」这类只对根节点成立的表就会被要求给合并提交也编一条文案。
 */
export type SystemCommitKind = 'baseline' | 'branch_baseline';

/**
 * 本地写路径（`writeCommit()`）会写下的种类：除了 `merge` 全都是
 *
 * @remarks
 * 本地没有合并命令，`writeCommit()` 的父链又只取当前 HEAD 一个——让它收 `merge` 就是允许写出一个只有一个父的合并提交。
 * 合并提交只能由导入写下（`working-tree/import-command.ts`），那条路自带完整的父链。
 */
export type LocalCommitKind = Exclude<CommitKind, 'merge'>;

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
  permissions: SYSTEM_ENTITY_PERMISSIONS,
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
   * 根 commit 为 `[]`，merge 可多父，顺序有语义：第 0 个是第一父，ChangeSet 就是相对它的增量（见 {@link CommitKind}）。
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
   * （列本身 not null，没有「无消息」这种物理状态）。导入的提交原样保存远端那一份（US-319），不 trim、不换文案：
   * 它参与内容指纹，改一个字节指纹就对不上。
   */
  message!: string;

  /**
   * 提交者；未记录时为 `null`
   */
  author!: string | null;

  /**
   * 创建时间
   *
   * @remarks
   * 本地提交由写入时刻给；导入的提交带远端那一份时间入库（US-319）。它不进内容指纹，也不参与「同 ID 是不是同一个提交」的判定。
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
