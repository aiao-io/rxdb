/**
 * @fileoverview T005 红测试：10 张工作树/提交物理表必须进得了核心的系统表登记簿。
 *
 * @remarks
 * 契约见 `git show f9528e8f:specs/001-working-tree-commits/data-model.md` §1 与 §0。
 *
 * 抽包之后这份守的东西变了一处，其余三处原样。从前它断言「10 个类在核心的
 * `SYSTEM_ENTITIES` 里」——那时核心自己写着这 10 行。现在核心只剩 4 张，这 10 张由本包经
 * {@link RxDBSystemContribution.entities} 声明、宿主在 `use()` 里 `registerSystemEntities()`
 * 追加进去。于是**顺序与身份的源头是这份声明**，登记簿是它的下游：顺序断言打在声明上
 * （下面的 `CONTRIBUTED`），接通断言打在 `use()` 之后的登记簿上。
 *
 * 四条断言各自防一种**不会编译报错**的事故：
 *
 * 1. **漏进声明** —— 漏掉一张表不会让任何 target 变红：表照样被 `@Entity` 装饰器声明出来，
 *    只是宿主永远不知道它存在，于是**建不出表**，首次用到时抛一句读不出主语的 `need init rxdb`。
 * 2. **声明了但没接通** —— `use()` 那条线断掉（插件没挂 `system`、或宿主没调
 *    `registerSystemEntities`）同样不编译报错。代价是这 10 张表被 `isSystemEntity()` 判否，
 *    于是按**库级 sync 配置**送进它们从不参与的同步管道（`RxDBAdapterHttp` 就是这么判的）。
 * 3. **顺序错** —— `SYSTEM_ENTITIES` 的顺序**就是**建表顺序，而 4 → 3、5/6/7/8 → `RxDBBranch`、
 *    10 → 9 都是真实外键。顺序错了在 PGlite 上是建表期硬失败，在 SQLite 上则可能悄悄建成
 *    无约束的表——后者正是「测不出来」的那一类。
 * 4. **`log !== false`** —— 新表自身的写入若被 change trigger 记录，会与「写工作树条目」
 *    互相递归（data-model.md §0 末段）。
 */

import { getEntityMetadata, getSystemEntityNames, isSystemEntity, RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { RxDBPluginWorkingTree, rxDBPluginWorkingTree } from '../../plugin.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 一个没 `init()` 过的宿主；`use()` 与读 `system` 都不需要连接。 */
const createDatabase = (): RxDB => {
  const database = new RxDB({
    dbName: `rxdb-system-entities-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
};

/**
 * 宿主在 `use()` 那一刻读到的那份声明。
 *
 * @remarks
 * 经**类**而不是 `rxDBPluginWorkingTree` 工厂取：`IRxDBPlugin.system` 是可选成员，走工厂
 * 拿到的是 `RxDBSystemContribution | undefined`，断言前要么 `!` 要么加一句守卫——两种写法
 * 都会让「本插件到底有没有声明 system」这一问在本文件里失去答案。类字段是非可选的，
 * 于是哪天它被改回可选，这一行**编译**就断。工厂那条真实路径由下面「接通」那一节覆盖。
 */
const CONTRIBUTED: readonly EntityType[] = new RxDBPluginWorkingTree(createDatabase()).system.entities;

/**
 * data-model.md §1 的 1→10 顺序，连同各自的物理表名。
 *
 * 表名一并断言：类名与 `tableName` 是两处独立书写的字符串，只对类名做断言的话，
 * 一个复制粘贴残留的 `tableName` 会一路活到真实数据库里。
 */
const EXPECTED_ORDER: readonly (readonly [EntityType, string])[] = [
  [CommitCapabilityState, 'rxdb_commit_capability'],
  [WorkingTreeActivationState, 'rxdb_working_tree_activation'],
  [Commit, 'rxdb_commit'],
  [CommitChangeSet, 'rxdb_commit_change_set'],
  [CommitBranchRef, 'rxdb_commit_branch_ref'],
  [WorkingTreeState, 'rxdb_working_tree_state'],
  [WorkingTreeEntry, 'rxdb_working_tree_entry'],
  [WorkingTreeRestoreSession, 'rxdb_working_tree_restore_session'],
  [WorkingTreeMaterializationStage, 'rxdb_working_tree_materialization_stage'],
  [WorkingTreeMaterializationPage, 'rxdb_working_tree_materialization_page']
];

describe('工作树与提交系统表登记', () => {
  it('10 个类全部出现在系统贡献里，顺序与 data-model.md §1 的 1→10 一致（顺序即建表顺序）', () => {
    expect(CONTRIBUTED).toEqual(EXPECTED_ORDER.map(([EntityClass]) => EntityClass));
  });

  it('use() 之后核心的登记簿当场认得这 10 张表', () => {
    const database = createDatabase();
    database.use(rxDBPluginWorkingTree);

    const registeredNames = getSystemEntityNames();
    for (const [EntityClass] of EXPECTED_ORDER) {
      // 两个谓词都要断言：`isSystemEntity` 按 `namespace:name` 判（跨包消费者用它决定同步行为），
      // `getSystemEntityNames` 只按 `name` 判（捕获的排除集用它）。两份派生集合各有各的漏法。
      expect(isSystemEntity(EntityClass)).toBe(true);
      expect(registeredNames.has(getEntityMetadata(EntityClass).name)).toBe(true);
    }
  });

  it('10 个类一律 namespace=rxdb、log=false，且表名与 data-model.md §1 一致', () => {
    for (const [EntityClass, tableName] of EXPECTED_ORDER) {
      const metadata = getEntityMetadata(EntityClass);
      expect({ namespace: metadata.namespace, tableName: metadata.tableName, log: metadata.log }).toEqual({
        namespace: 'rxdb',
        tableName,
        log: false
      });
    }
  });
});
