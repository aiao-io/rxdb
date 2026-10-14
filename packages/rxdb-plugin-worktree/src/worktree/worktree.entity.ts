/**
 * @fileoverview `Worktree` 实体定义（US-310）
 *
 * 命名工作上下文：一行 = 一个钉在某条分支上的 worktree。本插件贡献的第 11 张系统表。
 */

import {
  Entity,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDBBranch,
  SYSTEM_ENTITY_PERMISSIONS,
  uuid,
  type EntityManager
} from '@aiao/rxdb';

/**
 * 钉在分支上的命名工作上下文
 *
 * @remarks
 * - **1:1 钉住**：`branchId` 上的唯一索引保证一条分支至多一行。唯一性只能走 `indexes`——
 *   `branchId` 是 MANY_TO_ONE 生成的外键列，再声明同名属性会与它撞车（`WorkingTreeEntry`
 *   的 `idx_working_tree_entry_identity` 同款）。命令体在事务里先读一次再插，这条索引是多连接并发时的后盾。
 * - **没有「当前 worktree」列**：当前 checkout 的唯一真相是 `rxdb_branch.activated`，
 *   与 `activation-state.ts` 的「没有第二份 active branch ID」同一条裁决。
 * - **没有未提交改动列**：worktree 的未提交改动就是所钉分支的 `WorkingTreeState`，按分支隔离保存。
 * - **行建出来就不再改**：没有改名操作，所以只带 `createdAt`，与不可变的 `Commit` 同口径。
 */
@Entity({
  namespace: 'rxdb',
  name: 'Worktree',
  tableName: 'rxdb_worktree',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'label',
      type: PropertyType.string,
      nullable: true
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: 'CURRENT_TIMESTAMP'
    }
  ],
  indexes: [
    {
      name: 'idx_worktree_branch',
      properties: ['branchId'],
      unique: true
    }
  ],
  relations: [
    {
      name: 'branch',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'worktrees',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
export class Worktree {
  /**
   * 主键（uuid）
   */
  id!: string;

  /**
   * 所钉分支 id（外键列，唯一）
   */
  branchId!: string;

  /**
   * 显示名；`null` 时界面显示 `branchId`
   */
  label!: string | null;

  /**
   * 创建时间；写入时由适配器填充（PGlite 用库时钟，SQLite 族用客户端时钟）
   */
  createdAt!: Date;

  /**
   * 关联分支
   *
   * @remarks
   * `declare` 的理由同 `WorkingTreeState.branch`：普通字段声明在 `useDefineForClassFields` 下会给每个实例
   * 多挂一个从没赋过值的自有属性。
   */
  declare branch?: RxDBBranch;
}

/**
 * 造一行 worktree（未落库）
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 要钉的分支
 * @param label - 显示名；`null` 表示不起名
 * @returns 未落库的行，调用方负责写下去
 *
 * @remarks
 * 新库初始行、`0005-worktrees` 迁移与 `createWorktree()` 三条入口共用这一处：各写一份的话，
 * 「新建的库」「升上来的库」「运行期建出来的行」会从第一天起就是三种行。
 * `createdAt` 不赋值，留给适配器在写入时填（PGlite 用库时钟，SQLite 族用客户端时钟）。
 */
export const createWorktreeRow = (entityManager: EntityManager, branchId: string, label: string | null): Worktree => {
  const row = entityManager.instantiate(Worktree);
  row.id = uuid();
  row.branchId = branchId;
  row.label = label;
  return row;
};
