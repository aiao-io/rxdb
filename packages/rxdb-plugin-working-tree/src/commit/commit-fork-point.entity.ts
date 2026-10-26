/**
 * @fileoverview `CommitForkPoint` 实体：一个提交在变更日志上的位置（US-314 阶段 A）
 *
 * 与提交同一事务写入，只追加。从提交建分支时，新分支就在这里分叉。
 */

import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

/**
 * 一个提交刚完成时，它所在的分支停在变更日志的哪一点
 *
 * @remarks
 * - 主键就是提交 id；与提交**同一事务**写入（`write-commit.ts`），只追加。
 * - **存的是位置，不是恢复数据**：与 `rxdb_branch.fromChangeId` 是同一种东西，提交的可恢复性一点都不挂在它上面
 *   （`CommitChangeSet` 照旧自带完整补丁）。它指向的变更行只有删分支一条路径会删，而分叉点所在的分支在有后代时删不掉。
 * - **单独一张表而不是 `rxdb_commit` 上的一列**：插件的迁移只拿得到事务执行器，给既有表补列要各后端各写一遍 DDL；
 *   缺的贡献表则在连接时整表补建。提交行的内容指纹也因此不动。
 * - 没有这一行的提交（这张表出现之前的提交、metadata-only 分支首次物化写下的基线）不能拿来建分支，
 *   事后从数据推不准它的位置。
 */
@Entity({
  namespace: 'rxdb',
  name: 'CommitForkPoint',
  tableName: 'rxdb_commit_fork_point',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'branchId',
      type: PropertyType.string
    },
    {
      name: 'changeId',
      type: PropertyType.integer,
      nullable: true
    },
    {
      name: 'revertedCount',
      type: PropertyType.integer
    },
    {
      name: 'maxRevertChangeId',
      type: PropertyType.integer,
      nullable: true
    }
  ]
})
export class CommitForkPoint {
  /**
   * 提交 id
   */
  id!: string;

  /**
   * 提交时 ref 所属的分支，也是从这个提交建出的分支的父分支
   */
  branchId!: string;

  /**
   * 提交那一刻该分支未回滚的最大一条自有变更；一条都没有时为 `null`
   *
   * @remarks
   * `null` 是「停在这条分支自己的分叉点上」，与 `createBranch()` 在一条没有自有变更的分支上写下的分叉点同义。
   */
  changeId!: number | null;

  /**
   * 提交那一刻，谱系上不晚于分叉点的变更里有多少条处于回滚状态
   *
   * @remarks
   * 与 {@link CommitForkPoint.maxRevertChangeId} 合起来判「提交之后有没有撤销 / 重做改过这段谱系」：
   * 撤销给变更行写一个新领的回滚号（全局单调、不复用），重做把它清空。于是此后有过撤销，最大回滚号必然变大；
   * 只有重做，条数必然变少。两者都没变，回滚状态的集合就与提交那一刻相同。
   */
  revertedCount!: number;

  /**
   * 提交那一刻，谱系上不晚于分叉点的变更里最大的回滚号；一条都没回滚时为 `null`
   */
  maxRevertChangeId!: number | null;
}
