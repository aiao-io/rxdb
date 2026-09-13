/**
 * @fileoverview T005 红测试：10 张工作树/提交物理表必须登记进 `SYSTEM_ENTITIES`。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/data-model.md` §1 与 §0。
 *
 * 三条断言各自防一种**不会编译报错**的事故：
 *
 * 1. **漏登记 `SYSTEM_ENTITIES`** —— `system-entities.ts` 的注释原文是「清单只此一份」。
 *    漏掉一张表不会让任何 target 变红：表照样被 `@Entity` 装饰器声明出来，只是永远不会
 *    被 `SchemaManager.init` 补进 `config.entities`，于是**建不出表**。
 * 2. **`isSystemEntity()` 判否** —— 该谓词按 `namespace:name` 比对（不按类引用，见
 *    `system-entities.ts` 的注释：混合解析下会有两份模块实例）。判否的代价是新表被按
 *    **库级 sync 配置**送进它们从不参与的同步管道。
 * 3. **`log !== false`** —— 新表自身的写入若被 change trigger 记录，会与「写工作树条目」
 *    互相递归（data-model.md §0 末段）。
 *
 * 顺序也断言：`SYSTEM_ENTITIES` 的顺序**就是**建表顺序，而 4 → 3、5/6/7/8 → `RxDBBranch`、
 * 10 → 9 都是真实外键。顺序错了在 PGlite 上是建表期硬失败，在 SQLite 上则可能悄悄建成
 * 无约束的表——后者正是「测不出来」的那一类。
 */

import { describe, expect, it } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { isSystemEntity, SYSTEM_ENTITIES } from '../../system/system-entities.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';

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
  it('10 个类全部出现在 SYSTEM_ENTITIES 中', () => {
    for (const [EntityClass] of EXPECTED_ORDER) {
      expect(SYSTEM_ENTITIES).toContain(EntityClass);
    }
  });

  it('追加顺序与 data-model.md §1 的 1→10 一致（顺序即建表顺序）', () => {
    // 只取尾部 10 项：既有的 RxDBBranch / RxDBChange / RxDBMigration / RxDBSync 仍在首段，
    // 断言整份清单会让「新增第 5 张既有表」这类无关变更把本用例弄红。
    const appended = SYSTEM_ENTITIES.slice(-EXPECTED_ORDER.length);
    expect(appended).toEqual(EXPECTED_ORDER.map(([EntityClass]) => EntityClass));
  });

  it('isSystemEntity() 对 10 个类全部为真', () => {
    for (const [EntityClass] of EXPECTED_ORDER) {
      expect(isSystemEntity(EntityClass)).toBe(true);
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
